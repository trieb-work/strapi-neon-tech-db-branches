"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const neon_sdk_1 = require("neon-sdk");
const git_branch_1 = __importDefault(require("git-branch"));
const pg_connection_string_1 = require("pg-connection-string");
const multiselect_prompt_1 = __importDefault(require("multiselect-prompt"));
let initBranch = "";
let initStrapi = undefined;
// Restart Server if git branch changes
setInterval(async () => {
    const currentBranch = await (0, git_branch_1.default)();
    if (initBranch && initBranch !== currentBranch && initStrapi) {
        console.log("reload", typeof initStrapi);
        initStrapi.reload();
    }
}, 1500);
exports.default = async ({ strapi }) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const config = strapi.config.get('plugin.strapi-neon-tech-db-branches');
    initStrapi = strapi;
    if (config.gitBranch) {
        console.warn(`Using fixed branch ${config.gitBranch} for neon DB`);
    }
    const gitBranchName = config.gitBranch || await (0, git_branch_1.default)();
    if (!gitBranchName) {
        throw new Error("Could not get branch name");
    }
    initBranch = config.gitBranch ? "" : gitBranchName; // disable restart for fixed branch by not set initBranch
    const neonClient = new neon_sdk_1.NeonClient({
        TOKEN: config.neonApiKey,
    });
    const projects = await neonClient.project.listProjects();
    let project;
    if (projects === null || projects === void 0 ? void 0 : projects.projects) {
        project = (_a = projects === null || projects === void 0 ? void 0 : projects.projects) === null || _a === void 0 ? void 0 : _a.find((p) => { var _a, _b; return ((_a = p.name) === null || _a === void 0 ? void 0 : _a.trim()) === ((_b = config.neonProjectName) === null || _b === void 0 ? void 0 : _b.trim()); });
    }
    if (!project) {
        throw new Error(`No Project found with this Name ${config.neonProjectName}`);
    }
    const branches = await neonClient.project.listProjectBranches(project.id);
    let branch;
    if (branches === null || branches === void 0 ? void 0 : branches.branches) {
        branch = (_b = branches === null || branches === void 0 ? void 0 : branches.branches) === null || _b === void 0 ? void 0 : _b.find((b) => { var _a; return ((_a = b.name) === null || _a === void 0 ? void 0 : _a.trim()) === (gitBranchName === null || gitBranchName === void 0 ? void 0 : gitBranchName.trim()); });
    }
    let dbConnectionUri = "";
    if (!branch) {
        const createBranchConf = {
            "branch": {
                "name": gitBranchName,
            },
            "endpoints": [{
                    "type": "read_write",
                }]
        };
        branch = await neonClient.branch.createProjectBranch(project.id, createBranchConf).catch(async (err) => {
            var _a, _b, _c;
            if (((_a = err === null || err === void 0 ? void 0 : err.body) === null || _a === void 0 ? void 0 : _a.code) === "BRANCHES_LIMIT_EXCEEDED") {
                const options = (_c = (_b = branches === null || branches === void 0 ? void 0 : branches.branches) === null || _b === void 0 ? void 0 : _b.filter((b) => b.name !== "main" && b.name !== "master")) === null || _c === void 0 ? void 0 : _c.map((b) => ({
                    title: b.name,
                    value: b.id,
                }));
                const selection = await new Promise((res) => (0, multiselect_prompt_1.default)("Neon.tech branches limit exceeded. Should we delete unused branches?", options).on('submit', (items) => res(items)));
                const selectedOptionsValues = selection.map((o, idx) => { var _a; return o.selected ? (_a = options === null || options === void 0 ? void 0 : options[idx]) === null || _a === void 0 ? void 0 : _a.value : undefined; }).filter((v) => !!v);
                for (const branchId of selectedOptionsValues) {
                    try {
                        await neonClient.branch.deleteProjectBranch(project.id, branchId);
                        await new Promise((res) => setTimeout(res, 2500)); // sleep few till branch delete operation is finished
                        console.log("branch", branchId, "deleted");
                    }
                    catch (err) {
                        console.log("something went wrong deleting branch ", branchId, ": ", err.body.message);
                    }
                }
                return neonClient.branch.createProjectBranch(project.id, createBranchConf);
            }
        });
        if (!branch) {
            throw new Error("Could not create branch");
        }
        console.log(`Successfully created new neon.tech DB branch ${gitBranchName}`);
        await new Promise((res) => setTimeout(res, 4500)); // sleep few sec till new endpoint is started
        dbConnectionUri = (_d = (_c = branch === null || branch === void 0 ? void 0 : branch.connection_uris) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.connection_uri;
        if (!dbConnectionUri) {
            throw new Error("Returned without connection Uri. Res:" + JSON.stringify(branch, undefined, 2));
        }
    }
    // branch already existed. Manually fetch connection uri
    if (!dbConnectionUri) {
        const endpoint = await neonClient.branch.listProjectBranchEndpoints(project.id, branch.id);
        const pw = await neonClient.branch.getProjectBranchRolePassword(project.id, branch.id, config.neonRole);
        const ep = (_e = endpoint === null || endpoint === void 0 ? void 0 : endpoint.endpoints) === null || _e === void 0 ? void 0 : _e[0];
        const password = pw === null || pw === void 0 ? void 0 : pw.password;
        if (!ep) {
            throw new Error("Could not fetch endpoint");
        }
        if (!password) {
            throw new Error("Could not fetch password");
        }
        dbConnectionUri = `postgres://${config.neonRole}:${password}@${ep.host}/neondb`;
    }
    const dbConnection = (0, pg_connection_string_1.parse)(dbConnectionUri);
    const currConf = strapi.config.get('database');
    const newConf = {
        connectionString: dbConnectionUri || (currConf === null || currConf === void 0 ? void 0 : currConf.connectionString),
        host: (dbConnection === null || dbConnection === void 0 ? void 0 : dbConnection.host) || (currConf === null || currConf === void 0 ? void 0 : currConf.host),
        port: (dbConnection === null || dbConnection === void 0 ? void 0 : dbConnection.port) || (currConf === null || currConf === void 0 ? void 0 : currConf.port),
        database: (dbConnection === null || dbConnection === void 0 ? void 0 : dbConnection.database) || (currConf === null || currConf === void 0 ? void 0 : currConf.database),
        user: (dbConnection === null || dbConnection === void 0 ? void 0 : dbConnection.user) || (currConf === null || currConf === void 0 ? void 0 : currConf.user),
        password: (dbConnection === null || dbConnection === void 0 ? void 0 : dbConnection.password) || (currConf === null || currConf === void 0 ? void 0 : currConf.password),
        ssl: (_f = currConf === null || currConf === void 0 ? void 0 : currConf.ssl) !== null && _f !== void 0 ? _f : {
            rejectUnauthorized: true
        },
        schema: (_g = currConf === null || currConf === void 0 ? void 0 : currConf.schema) !== null && _g !== void 0 ? _g : 'public',
    };
    strapi.config.set('database.connection.connection', newConf);
    strapi.config.set('database.connection.client', 'postgres');
    console.log(`Connecting to DB ${newConf.host} (branch ${gitBranchName}) with user ${newConf.user}`);
};
