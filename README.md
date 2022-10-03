# Clean Dangling Amplify Studio User Pools / Lambda Triggers

After deleting a Studio-enabled Amplify app, Cognito user pools and lambda trigger resources are left dangling in your AWS account.

See issue reported at https://github.com/aws-amplify/amplify-adminui/issues/362

This package contains a script that finds these dangling resources and deletes them.

## Authorization

To authorize, run `aws configure` to set up your `~/.aws/credentials` file.

## Running the script

First, install dependencies:

```zsh
npm install
```

Then, you need to specify the region you're trying to clean as an environment variable before running the script. For example:

```zsh
AWS_REGION=us-west-2 node index.js
```