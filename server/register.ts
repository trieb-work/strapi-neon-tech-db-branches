import { Strapi } from "@strapi/strapi";
import {
  BranchCreateRequest,
  BranchesResponse,
  EndpointsResponse,
  NeonClient,
  ProjectsResponse,
  RolePasswordResponse,
} from "neon-sdk";
import { NeonTechDburlConfig } from "./config";
import getBranch from "git-branch";
import { parse } from "pg-connection-string";
import prompts from "prompts";

let initBranch = "";
let initStrapi: Strapi | undefined = undefined;

async function checkBranchChange() {
  if (initBranch === "") {
    await new Promise((r) => setTimeout(r, 1_500));
    await checkBranchChange();
  }
  const currentBranch = await getBranch();
  if (initBranch !== currentBranch && initStrapi) {
    initBranch = "";
    await createAndSetPostgresConfig();
    await new Promise((r) => setTimeout(r, 500));
    initStrapi.reload();
    await new Promise((r) => setTimeout(r, 5_000));
  }
  await new Promise((r) => setTimeout(r, 1_500));
  await checkBranchChange();
}
checkBranchChange();

async function createAndSetPostgresConfig() {
  const config = strapi.config.get(
    "plugin.strapi-neon-tech-db-branches"
  ) as NeonTechDburlConfig;
  if (config.gitBranch) {
    console.warn(`Using fixed branch ${config.gitBranch} for neon DB`);
  }
  const gitBranchName = config.gitBranch || (await getBranch());
  if (!gitBranchName) {
    throw new Error("Could not get branch name");
  }
  initBranch = config.gitBranch ? "" : gitBranchName; // disable restart for fixed branch by not set initBranch
  const neonClient = new NeonClient({
    TOKEN: config.neonApiKey,
  });
  const projects =
    (await neonClient.project.listProjects()) as ProjectsResponse;
  let project;
  if (projects?.projects) {
    project = projects?.projects?.find(
      (p: any) => p.name?.trim() === config.neonProjectName?.trim()
    );
  }
  if (!project) {
    throw new Error(
      `No Project found with this Name ${config.neonProjectName}`
    );
  }
  const branches = (await neonClient.branch.listProjectBranches(
    project.id
  )) as BranchesResponse;
  let branch;
  if (branches?.branches) {
    branch = branches?.branches?.find(
      (b: any) => b.name?.trim() === gitBranchName?.trim()
    );
  }
  let dbConnectionUri: string = "";
  if (!branch) {
    const createBranchConf: BranchCreateRequest = {
      branch: {
        name: gitBranchName,
      },
      endpoints: [
        {
          type: "read_write",
        },
      ],
    };
    branch = await neonClient.branch
      .createProjectBranch(project.id, createBranchConf)
      .catch(async (err) => {
        if (err?.body?.code === "BRANCHES_LIMIT_EXCEEDED") {
          const choices = branches?.branches
            ?.filter((b) => b.name !== "main" && b.name !== "master")
            ?.map((b) => ({
              title: b.name,
              value: b.id,
            }));

          console.warn("Neon.tech branches limit exceeded.");

          const selection = await prompts([
            {
              type: "multiselect",
              name: "value",
              message: "Should we delete unused branches",
              choices: choices,
              max: 10,
              hint: "- Space to select. Return to submit",
            },
          ]);

          for (const branchId of selection?.value) {
            try {
              await neonClient.branch.deleteProjectBranch(project.id, branchId);
              await new Promise((res) => setTimeout(res, 2_500)); // sleep few till branch delete operation is finished
              console.log("branch", branchId, "deleted");
            } catch (err) {
              console.log(
                "something went wrong deleting branch ",
                branchId,
                ": ",
                err.body.message
              );
            }
          }
          return neonClient.branch.createProjectBranch(
            project.id,
            createBranchConf
          );
        }
      });
    if (!branch) {
      throw new Error("Could not create branch");
    }
    console.log(
      `Successfully created new neon.tech DB branch ${gitBranchName}`
    );
    await new Promise((res) => setTimeout(res, 4_500)); // sleep few sec till new endpoint is started
    dbConnectionUri = branch?.connection_uris?.[0]?.connection_uri;
    if (!dbConnectionUri) {
      throw new Error(
        "Returned without connection Uri. Res:" +
          JSON.stringify(branch, undefined, 2)
      );
    }
  }
  // branch already existed. Manually fetch connection uri
  if (!dbConnectionUri) {
    const endpoint = (await neonClient.branch.listProjectBranchEndpoints(
      project.id,
      branch.id
    )) as EndpointsResponse;
    const pw = (await neonClient.branch.getProjectBranchRolePassword(
      project.id,
      branch.id,
      config.neonRole
    )) as RolePasswordResponse;
    const ep = endpoint?.endpoints?.[0];
    const password = pw?.password;
    if (!ep) {
      throw new Error("Could not fetch endpoint");
    }
    if (!password) {
      throw new Error("Could not fetch password");
    }
    dbConnectionUri = `postgres://${config.neonRole}:${password}@${ep.host}/neondb`;
  }
  const dbConnection = parse(dbConnectionUri);
  const currConf = strapi.config.get("database");
  const newConf = {
    connectionString: dbConnectionUri || currConf?.connectionString,
    host: dbConnection?.host || currConf?.host,
    port: dbConnection?.port || currConf?.port,
    database: dbConnection?.database || currConf?.database,
    user: dbConnection?.user || currConf?.user,
    password: dbConnection?.password || currConf?.password,
    ssl: {
      require: true,
      rejectUnauthorized: true,
      ...currConf?.ssl,
    },
    schema: currConf?.schema ?? "public",
  };
  strapi.config.set("database.connection.connection", newConf);
  strapi.config.set("database.connection.client", "postgres");
  console.log(
    `Connecting to DB ${newConf.host} (branch ${gitBranchName}) with user ${newConf.user}`
  );
}

export default async ({ strapi }: { strapi: Strapi }) => {
  initStrapi = strapi;
  await createAndSetPostgresConfig();
};
