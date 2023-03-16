# Strapi plugin strapi-neon-tech-db-branches
This plugin integrates neon.tech with Strapi. It does the following:
- automatically inject the postgres connection string (host, port, username, password) using your current git branch or environment variables
- create a new neon database branch for your current working git branch

The neon parent branch will always be the main branch. Therefore this plugin follows the develop-preview-ship principle.

## Installation
```
npm i strapi-neon-tech-db-branches
```
```
pnpm i strapi-neon-tech-db-branches
```

## Configuration
First create a new project in neon.tech and copy your credentials for the following Setup.
During development the git-branch does not have to be set and is automatically read from your `.git/head/refs` file.

This plugin can be configured via Environment variables or via plugins.js config:

#### Configure via Environment Variables:
* `NEON_API_KEY` get it from here: https://console.neon.tech/app/settings/api-keys
* `NEON_PROJECT_NAME` the neon project under wich your DB runs
* `NEON_ROLE` create it manually under roles for your project first
* `GIT_BRANCH || GITHUB_REF_NAME || VERCEL_GIT_COMMIT_REF` The branch can be pinned via one of these env variables (will use first available). If set, plugin will not use branch from git then. Usefull for deployment or in CI


#### Configure via plugin.js config:
```js
module.exports = {
  ...
  'strapi-neon-tech-db-branches': {
    enabled: true,
    resolve: './src/plugins/strapi-neon-tech-db-branches',
    config: {
      neonApiKey: "09hx...0a8yjd", // get it from here: https://console.neon.tech/app/settings/api-keys
      neonProjectName: "strapi-project-xyz", // the neon project under wich your DB runs
      neonRole: "sample-user", // create it manually under roles for your project first
      //(gitBranch: "main") // branch can be pinned via this config option. Will not use branch from git then. Usefull for preview/production deployment
    }
  },
  ...
}
```

## Usage in CI (for production/preview deployments):
For a production/preview deployment you generally do not want to deploy your whole git repo but instead build and bundle your application. Make sure to start the bundled application with environment variable `GIT_BRANCH` set. Best Option is to add this env variable in your CI Pipeline to the preview deployment. In Github Actions the git branch name is available during the CI run with `${{ github.ref_name }}` .
