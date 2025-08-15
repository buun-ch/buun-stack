import KcAdminClient from "@keycloak/keycloak-admin-client";
import invariant from "tiny-invariant";

const main = async () => {
  const keycloakHost = process.env.KEYCLOAK_HOST;
  invariant(keycloakHost, "KEYCLOAK_HOST environment variable is required.");

  const adminUsername = process.env.KEYCLOAK_ADMIN_USER;
  invariant(adminUsername, "KEYCLOAK_ADMIN_USER environment variable is required.");

  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
  invariant(adminPassword, "KEYCLOAK_ADMIN_PASSWORD environment variable is required");

  const realmName = process.env.KEYCLOAK_REALM;
  invariant(realmName, "KEYCLOAK_REALM environment variable is required");

  const username = process.env.USERNAME;
  invariant(username, "USERNAME environment variable is required");

  const groupName = process.env.GROUP_NAME;
  invariant(groupName, "GROUP_NAME environment variable is required");

  const kcAdminClient = new KcAdminClient({
    baseUrl: `https://${keycloakHost}`,
    realmName: "master",
  });

  try {
    await kcAdminClient.auth({
      username: adminUsername,
      password: adminPassword,
      grantType: "password",
      clientId: "admin-cli",
    });
    console.log("Authentication successful.");

    kcAdminClient.setConfig({ realmName });

    // Find user
    const users = await kcAdminClient.users.find({ username });
    const user = users.find(u => u.username === username);
    if (!user) {
      throw new Error(`User '${username}' not found`);
    }

    // Find group
    const groups = await kcAdminClient.groups.find({ search: groupName });
    const group = groups.find(g => g.name === groupName);
    if (!group) {
      throw new Error(`Group '${groupName}' not found`);
    }

    // Check if user is already in group
    const userGroups = await kcAdminClient.users.listGroups({ id: user.id! });
    const isAlreadyMember = userGroups.some(ug => ug.id === group.id);
    
    if (isAlreadyMember) {
      console.log(`User '${username}' is already a member of group '${groupName}'`);
      return;
    }

    // Add user to group
    await kcAdminClient.users.addToGroup({
      id: user.id!,
      groupId: group.id!,
    });

    console.log(`User '${username}' added to group '${groupName}' successfully`);
  } catch (error) {
    console.error("Error adding user to group:", error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
};

main();