export type NeonTechDburlConfig = {
  neonApiKey: string;
  neonProjectName: string;
  neonRole: string;
  gitBranch?: string;
}
type NeonTechDburlConfigAndValidator = {
  default: NeonTechDburlConfig;
  validator: (config: NeonTechDburlConfig) => void
}

const configEntry: NeonTechDburlConfigAndValidator = {
  default: {
    neonApiKey: process.env.NEON_API_KEY!,
    neonProjectName: process.env.NEON_PROJECT_NAME!,
    neonRole: process.env.NEON_ROLE!,
    gitBranch: process.env.GIT_BRANCH || process.env.GITHUB_REF_NAME || process.env.VERCEL_GIT_COMMIT_REF,
  },
  validator(config) {
    if(!config.neonApiKey){
      throw new Error("No neon api key defined. Set env var NEON_API_KEY or plugin config 'neonApiKey'");
    }
    if(!config.neonProjectName){
      throw new Error("No neon project name defined. Set env var NEON_PROJECT_NAME or plugin config 'neonProjectName'");
    }
    if(!config.neonRole){
      throw new Error("No neon project name defined. Set env var NEON_ROLE or plugin config 'neonRole'");
    }
  },
}
export default configEntry;