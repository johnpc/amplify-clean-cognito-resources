const Amplify = require("aws-sdk/clients/amplify");
const Lambda = require("aws-sdk/clients/lambda");
const CognitoIdentityServiceProvider = require("aws-sdk/clients/cognitoidentityserviceprovider");

if (!process.env.AWS_REGION) {
  console.error(
    "Please defined AWS_REGION environment variable for the region you're trying to clean. e.g. AWS_REGION=us-west-2 node index.js"
  );
  process.exit(1);
}
const awsAuthConfig = {
  region: process.env.AWS_REGION,
};
const cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider(
  awsAuthConfig
);
const lambda = new Lambda(awsAuthConfig);
const amplify = new Amplify(awsAuthConfig);

const sleep = (milliseconds) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const asyncFilter = async (arr, predicate) => {
  const results = await Promise.all(arr.map(predicate));
  return arr.filter((_v, index) => results[index]);
};

const listCognitoResourcesForDeletedApps = async () => {
  let nextToken = null;
  const userPools = [];
  do {
    const userPoolResult = await cognitoIdentityServiceProvider
      .listUserPools({
        MaxResults: 50,
        NextToken: nextToken,
      })
      .promise();
    for (userPool of userPoolResult.UserPools) {
      userPools.push(userPool);
    }
    nextToken = userPoolResult.NextToken;
  } while (nextToken);
  return userPools;
};

/**
 * @param {CognitoIdentityServiceProvider.UserPoolType[]} userPools
 */
const filterDeletedAmplifyApps = async (userPools) => {
  const filterFunction = async (userPool) => {
    const appId = userPool.Name.split("_").find(
      (nameSegment) => nameSegment.startsWith("d")
    );
    if (!appId || !userPool.Name.startsWith("amplify_backend_manager_")) {
      console.warn(`ignoring user pool with name ${userPool.Name}`);
      return false;
    }
    try {
      const appExists = await amplify
        .getApp({
          appId,
        })
        .promise();
      return !appExists;
    } catch (e) {
      if (e.code === "NotFoundException") {
        return true;
      } else {
        throw e;
      }
    }
  };
  return await asyncFilter(userPools, filterFunction);
};

const removeStudioLambdaTriggers = async (userpoolId) => {
  const studioUserPool = await cognitoIdentityServiceProvider
    .describeUserPool({
      UserPoolId: userpoolId,
    })
    .promise();
  if (studioUserPool.UserPool?.LambdaConfig) {
    const promises = Object.values(studioUserPool.UserPool?.LambdaConfig).map(
      async (arn) => {
        console.log(`Deleting lambda trigger with arn ${arn}`);
        try {
          return await lambda
            .deleteFunction({
              FunctionName: arn,
            })
            .promise();
        } catch (e) {
          if (e.code !== "ResourceNotFoundException") {
            throw e;
          }
        }
      }
    );
    await Promise.all(promises);
  }
};

const main = async () => {
  const cognitoUserPools = await listCognitoResourcesForDeletedApps();
  const filteredUserPools = await filterDeletedAmplifyApps(cognitoUserPools);
  for (userPool of filteredUserPools) {
    await removeStudioLambdaTriggers(userPool.Id);
    console.log(`Deleting user pool ${userPool.Name} with id ${userPool.Id}`);
    await cognitoIdentityServiceProvider
      .deleteUserPool({UserPoolId: userPool.Id})
      .promise();
    // Prevent "TooManyRequestsException: Rate exceeded"
    await sleep(1000);
  }
};

main();
