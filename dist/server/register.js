"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const neon_sdk_1 = require("neon-sdk");
const git_branch_1 = __importDefault(require("git-branch"));
const pg_connection_string_1 = require("pg-connection-string");
const prompts_1 = __importDefault(require("prompts"));
let initBranch = "";
let initStrapi = undefined;
async function checkBranchChange() {
    if (initBranch === "") {
        await new Promise((r) => setTimeout(r, 1500));
        await checkBranchChange();
    }
    const currentBranch = await (0, git_branch_1.default)();
    if (initBranch !== currentBranch && initStrapi) {
        initBranch = "";
        await createAndSetPostgresConfig();
        await new Promise((r) => setTimeout(r, 500));
        initStrapi.reload();
        await new Promise((r) => setTimeout(r, 5000));
    }
    await new Promise((r) => setTimeout(r, 1500));
    await checkBranchChange();
}
checkBranchChange();
async function createAndSetPostgresConfig() {
    var _a, _b, _c;
    const config = strapi.config.get("plugin.strapi-neon-tech-db-branches");
    if (config.gitBranch) {
        console.warn(`Using fixed branch ${config.gitBranch} for neon DB`);
    }
    const gitBranchName = config.gitBranch || (await (0, git_branch_1.default)());
    if (!gitBranchName) {
        throw new Error("Could not get branch name");
    }
    initBranch = config.gitBranch ? "" : gitBranchName; // disable restart for fixed branch by not set initBranch
    const neonClient = new neon_sdk_1.NeonClient({
        TOKEN: config.neonApiKey,
    });
    const projects = (await neonClient.project.listProjects());
    let project;
    if (projects === null || projects === void 0 ? void 0 : projects.projects) {
        project = (_a = projects === null || projects === void 0 ? void 0 : projects.projects) === null || _a === void 0 ? void 0 : _a.find((p) => { var _a, _b; return ((_a = p.name) === null || _a === void 0 ? void 0 : _a.trim()) === ((_b = config.neonProjectName) === null || _b === void 0 ? void 0 : _b.trim()); });
    }
    if (!project) {
        throw new Error(`No Project found with this Name ${config.neonProjectName}`);
    }
    const branches = (await neonClient.branch.listProjectBranches(project.id));
    let branch;
    if (branches === null || branches === void 0 ? void 0 : branches.branches) {
        branch = (_b = branches === null || branches === void 0 ? void 0 : branches.branches) === null || _b === void 0 ? void 0 : _b.find((b) => { var _a; return ((_a = b.name) === null || _a === void 0 ? void 0 : _a.trim()) === (gitBranchName === null || gitBranchName === void 0 ? void 0 : gitBranchName.trim()); });
    }
    let dbConnectionUri = "";
    if (!branch) {
        const createBranchConf = {
            branch: {
                name: gitBranchName,
            },
            endpoints: [
                {
                    type: "read_write",
                },
            ],
        };
        const newBranch = await neonClient.branch
            .createProjectBranch(project.id, createBranchConf)
            .catch(async (err) => {
            var _a, _b, _c;
            if (((_a = err === null || err === void 0 ? void 0 : err.body) === null || _a === void 0 ? void 0 : _a.code) === "BRANCHES_LIMIT_EXCEEDED") {
                const choices = (_c = (_b = branches === null || branches === void 0 ? void 0 : branches.branches) === null || _b === void 0 ? void 0 : _b.filter((b) => b.name !== "main" && b.name !== "master")) === null || _c === void 0 ? void 0 : _c.map((b) => ({
                    title: b.name,
                    value: b.id,
                }));
                console.warn("Neon.tech branches limit exceeded.");
                const selection = await (0, prompts_1.default)([
                    {
                        type: "multiselect",
                        name: "value",
                        message: "Should we delete unused branches",
                        choices: choices,
                        max: 10,
                        hint: "- Space to select. Return to submit",
                    },
                ]);
                for (const branchId of selection === null || selection === void 0 ? void 0 : selection.value) {
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
        if (!newBranch) {
            throw new Error("Could not create branch");
        }
        if ("code" in newBranch)
            throw new Error("Could not create branch:" + newBranch.message);
        console.log(`Successfully created new neon.tech DB branch ${gitBranchName}`);
        dbConnectionUri = await getConnectionUriManually(neonClient, project.id, newBranch.branch.id, config);
        console.log(`dbConnectionUri@newBranch:` + dbConnectionUri);
        if (!dbConnectionUri) {
            throw new Error("Could not fetch connection URI manually.");
        }
    }
    // branch already existed. Manually fetch connection uri
    if (!dbConnectionUri) {
        dbConnectionUri = await getConnectionUriManually(neonClient, project.id, branch.id, config);
        console.log(`dbConnectionUri@existingBranch:` + dbConnectionUri);
    }
    if (!dbConnectionUri) {
        throw new Error("Could not fetch connection URI manually.");
    }
    const dbConnection = (0, pg_connection_string_1.parse)(dbConnectionUri);
    const currConf = strapi.config.get("database");
    const newConf = {
        connectionString: dbConnectionUri || (currConf === null || currConf === void 0 ? void 0 : currConf.connectionString),
        host: (dbConnection === null || dbConnection === void 0 ? void 0 : dbConnection.host) || (currConf === null || currConf === void 0 ? void 0 : currConf.host),
        port: (dbConnection === null || dbConnection === void 0 ? void 0 : dbConnection.port) || (currConf === null || currConf === void 0 ? void 0 : currConf.port),
        database: (dbConnection === null || dbConnection === void 0 ? void 0 : dbConnection.database) || (currConf === null || currConf === void 0 ? void 0 : currConf.database),
        user: (dbConnection === null || dbConnection === void 0 ? void 0 : dbConnection.user) || (currConf === null || currConf === void 0 ? void 0 : currConf.user),
        password: (dbConnection === null || dbConnection === void 0 ? void 0 : dbConnection.password) || (currConf === null || currConf === void 0 ? void 0 : currConf.password),
        ssl: {
            require: true,
            rejectUnauthorized: true,
            ...currConf === null || currConf === void 0 ? void 0 : currConf.ssl,
        },
        schema: (_c = currConf === null || currConf === void 0 ? void 0 : currConf.schema) !== null && _c !== void 0 ? _c : "public",
    };
    strapi.config.set("database.connection.connection", newConf);
    strapi.config.set("database.connection.client", "postgres");
    console.log(`Connecting to DB ${newConf.host} (branch ${gitBranchName}) with user ${newConf.user}`);
}
async function createNewBranch() { }
async function getConnectionUriManually(neonClient, projectId, branchId, config, maxRetries = 5, delay = 2000) {
    var _a;
    console.log("@getConnectionUriManually");
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            const endpoint = (await neonClient.branch.listProjectBranchEndpoints(projectId, branchId));
            const pw = (await neonClient.branch.getProjectBranchRolePassword(projectId, branchId, config.neonRole));
            const ep = (_a = endpoint === null || endpoint === void 0 ? void 0 : endpoint.endpoints) === null || _a === void 0 ? void 0 : _a[0];
            const password = pw === null || pw === void 0 ? void 0 : pw.password;
            if (!ep) {
                console.error("Could not fetch endpoint");
                throw new Error("Could not fetch endpoint");
            }
            if (!password) {
                console.error("Could not fetch password");
                throw new Error("Could not fetch password");
            }
            return `postgres://${config.neonRole}:${password}@${ep.host}/neondb`;
        }
        catch (error) {
            console.error(`Attempt ${attempt + 1} failed: ${error.message}`);
        }
        // Exponential backoff delay
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        attempt++;
    }
    return null;
}
exports.default = async ({ strapi }) => {
    initStrapi = strapi;
    await createAndSetPostgresConfig();
};
