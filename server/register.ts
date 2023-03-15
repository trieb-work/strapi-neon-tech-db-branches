import { Strapi } from '@strapi/strapi';
import { BranchCreateRequest, BranchesResponse, EndpointsResponse, NeonClient, ProjectsResponse, RolePasswordResponse } from 'neon-sdk';
import { NeonTechDburlConfig } from './config';
import getBranch from 'git-branch';
import { parse } from 'pg-connection-string';
import prompt from 'multiselect-prompt';

let initBranch = "";
let initStrapi: Strapi | undefined = undefined;

// Restart Server if git branch changes
setInterval(async () => {
  const currentBranch = await getBranch();
  if(initBranch && initBranch !== currentBranch && initStrapi){
    console.log("reload", typeof initStrapi);
    initStrapi.reload();
  }
}, 1500);

export default async ({ strapi }: { strapi: Strapi }) => {
  const config = strapi.config.get('plugin.strapi-neon-tech-db-branches') as NeonTechDburlConfig
  initStrapi = strapi;
  if(config.gitBranch) {
    console.warn(`Using fixed branch ${config.gitBranch} for neon DB`);
  }
  const gitBranchName = config.gitBranch || await getBranch();
  if(!gitBranchName) {
    throw new Error("Could not get branch name");
  }
  initBranch = config.gitBranch ? "" : gitBranchName; // disable restart for fixed branch by not set initBranch
  const neonClient = new NeonClient({
    TOKEN: config.neonApiKey,
  });
  const projects = await neonClient.project.listProjects() as ProjectsResponse;
  let project;
  if(projects?.projects){
    project = projects?.projects?.find((p: any) => p.name?.trim() === config.neonProjectName?.trim())
  }
  if(!project){
    throw new Error(`No Project found with this Name ${config.neonProjectName}`)
  }
  const branches = await neonClient.project.listProjectBranches(project.id) as BranchesResponse; 
  let branch;
  if(branches?.branches){
    branch = branches?.branches?.find((b: any) => b.name?.trim() === gitBranchName?.trim())
  }
  let dbConnectionUri: string = "";
  if(!branch){
    const createBranchConf: BranchCreateRequest = {
      "branch": {
        "name": gitBranchName,
      },
      "endpoints": [{
        "type": "read_write",
      }]
    };
    branch = await neonClient.branch.createProjectBranch(project.id, createBranchConf).catch(async (err) => {
      if(err?.body?.code === "BRANCHES_LIMIT_EXCEEDED"){
        const options = branches?.branches?.filter((b) => b.name !== "main" && b.name !== "master")?.map((b) => ({
          title: b.name,
          value: b.id,
        }));
        const selection = await new Promise<{value: string, selected: boolean}[]>(
          (res) => prompt("Neon.tech branches limit exceeded. Should we delete unused branches?", 
          options
        ).on('submit', (items) => res(items)));
        const selectedOptionsValues = selection.map((o, idx) => o.selected ? options?.[idx]?.value : undefined).filter((v) => !!v) as string[]
        for(const branchId of selectedOptionsValues){
          try{
            await neonClient.branch.deleteProjectBranch(project.id, branchId);
            await new Promise((res) => setTimeout(res, 2_500)); // sleep few till branch delete operation is finished
            console.log("branch", branchId, "deleted");
          } catch(err) {
            console.log("something went wrong deleting branch ", branchId, ": ", err.body.message)
          }
        }
        return neonClient.branch.createProjectBranch(project.id, createBranchConf);
      }
    });
    if(!branch) {
      throw new Error("Could not create branch");
    }
    console.log(`Successfully created new neon.tech DB branch ${gitBranchName}`);
    await new Promise((res) => setTimeout(res, 4_500)); // sleep few sec till new endpoint is started
    dbConnectionUri = branch?.connection_uris?.[0]?.connection_uri;
    if(!dbConnectionUri){
      throw new Error("Returned without connection Uri. Res:" + JSON.stringify(branch, undefined, 2));
    }
  }
  // branch already existed. Manually fetch connection uri
  if(!dbConnectionUri) {
    const endpoint = await neonClient.branch.listProjectBranchEndpoints(project.id, branch.id) as EndpointsResponse;
    const pw = await neonClient.branch.getProjectBranchRolePassword(project.id, branch.id, config.neonRole) as RolePasswordResponse;
    const ep = endpoint?.endpoints?.[0];
    const password = pw?.password;
    if(!ep){
      throw new Error("Could not fetch endpoint");
    }
    if(!password){
      throw new Error("Could not fetch password");
    }
    dbConnectionUri = `postgres://${config.neonRole}:${password}@${ep.host}/neondb`;
  }
  const dbConnection = parse(dbConnectionUri);
  const currConf = strapi.config.get('database');
  const newConf = {
    connectionString: dbConnectionUri || currConf?.connectionString,
    host: dbConnection?.host || currConf?.host,
    port: dbConnection?.port || currConf?.port,
    database: dbConnection?.database || currConf?.database,
    user: dbConnection?.user || currConf?.user,
    password: dbConnection?.password || currConf?.password,
    ssl: currConf?.ssl ?? {
      rejectUnauthorized: true
    },
    schema: currConf?.schema ?? 'public',
  };
  strapi.config.set('database.connection.connection', newConf);
  strapi.config.set('database.connection.client','postgres');
  console.log(`Connecting to DB ${newConf.host} (branch ${gitBranchName}) with user ${newConf.user}`)
};