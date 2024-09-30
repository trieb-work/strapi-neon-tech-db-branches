import { Strapi } from "@strapi/strapi";
import {
  Branch,
  BranchCreateRequest,
  BranchesResponse,
  BranchResponse,
  EndpointsResponse,
  GeneralError,
  NeonClient,
  ProjectListItem,
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
  let project: ProjectListItem | undefined;
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
  const branches: BranchesResponse | GeneralError =
    await neonClient.branch.listProjectBranches(project.id);
  if ("code" in branches)
    throw new Error("Could not fetch all branches:" + branches.message);

  let branch: Branch | undefined;
  if (branches?.branches) {
    branch = branches?.branches?.find(
      (b: any) => b.name?.trim() === gitBranchName?.trim()
    );
  }

  let dbConnectionUri: string | null = "";
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

    console.log("Creating a new branch...: " + gitBranchName);
    const newBranch: BranchResponse | GeneralError | undefined =
      await neonClient.branch
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
                await neonClient.branch.deleteProjectBranch(
                  project.id,
                  branchId
                );
                await new Promise((res) => setTimeout(res, 2_500)); // sleep few till branch delete operation is finished
                console.log("branch with id ", branchId, "deleted");
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
    if (!newBranch) {
      throw new Error("Could not create branch");
    }

    if ("code" in newBranch)
      throw new Error("Could not create branch:" + newBranch.message);

    console.log(
      `Successfully created new neon.tech DB branch ${gitBranchName}`
    );

    dbConnectionUri = await getConnectionUriManually(
      neonClient,
      project.id,
      newBranch.branch.id,
      config
    );

    if (!dbConnectionUri) {
      throw new Error("Could not fetch connection URI manually.");
    }
  }


  // branch already existed. Manually fetch connection uri
  if (!dbConnectionUri) {
    dbConnectionUri = await getConnectionUriManually(
      neonClient,
      project.id,
      branch!.id,
      config
    );
    // console.log(`dbConnectionUri@existingBranch:` + dbConnectionUri);
  }

  if (!dbConnectionUri) {
    throw new Error("Could not fetch connection URI manually.");
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

async function getConnectionUriManually(
  neonClient: NeonClient,
  projectId: string,
  branchId: string,
  config: NeonTechDburlConfig,
  maxRetries: number = 5,
  delay: number = 2000
): Promise<string | null> {
  // console.log("@getConnectionUriManually");
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const endpoint = (await neonClient.branch.listProjectBranchEndpoints(
        projectId,
        branchId
      )) as EndpointsResponse;
      const pw = (await neonClient.branch.getProjectBranchRolePassword(
        projectId,
        branchId,
        config.neonRole
      )) as RolePasswordResponse;
      const ep = endpoint?.endpoints?.[0];
      const password = pw?.password;
      if (!ep) {
        console.error("Could not fetch endpoint");
        throw new Error("Could not fetch endpoint");
      }
      if (!password) {
        console.error("Could not fetch password");
        throw new Error("Could not fetch password");
      }
      return `postgres://${config.neonRole}:${password}@${ep.host}/neondb`;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed: ${error.message}`);
    }

    // Exponential backoff delay
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay *= 2;
    attempt++;
  }
  return null;
}

export default async ({ strapi }: { strapi: Strapi }) => {
  initStrapi = strapi;
  await createAndSetPostgresConfig();
};
