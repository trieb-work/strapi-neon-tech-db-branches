# Strapi v4 plugin strapi-neon-tech-db-branches

This plugin integrates neon.tech with Strapi. It does the following:

- automatically inject the postgres connection string (host, port, username, password) using your current git branch or environment variables
- create a new neon database branch for your current working git branch
- the same database branch is used in development as well as in the preview deployment which eliminates copying and recreation of testing data

![isolated databases](https://user-images.githubusercontent.com/5111431/225722017-a5706fef-c9c9-4632-ae3d-75867e7971ea.svg)

The neon parent branch will always be the main branch. Therefore this plugin follows the develop-preview-ship principle. This will make working with Strapi way more easy since therefore Strapi is always "seeded" with live data.

## Installation

**The `neon-sdk` dependency requires at least node v18. Therefore this package also requires at least node v18**

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

- `NEON_API_KEY` get it from here: https://console.neon.tech/app/settings/api-keys
- `NEON_PROJECT_NAME` the neon project under wich your DB runs
- `NEON_ROLE` create it manually under roles for your project first
- `GIT_BRANCH || GITHUB_REF_NAME || VERCEL_GIT_COMMIT_REF` The branch can be pinned via one of these env variables (will use first available). If set, plugin will not use branch from git then. Usefull for deployment or in CI

#### Configure via config/plugin.js config:

```js
module.exports = {
  ...
  'strapi-neon-tech-db-branches': {
    enabled: true,
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

If you have any API liveness probes/checks for your containers, make sure to use a route wich does not trigger DB usage. Otherwise your neon endpoints will run even on inactivity. DB get's triggered for example on `/index.html` so better use something from the static folder like `/assets/images/logo_login.png/assets/images/logo_login.png`

## Sponsors

[Strapi Plugin developed and maintained by trieb.work cloud consulting](https://trieb.work/)
