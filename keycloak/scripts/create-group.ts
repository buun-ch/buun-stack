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

  const groupName = process.env.GROUP_NAME;
  invariant(groupName, "GROUP_NAME environment variable is required");

  const parentGroupName = process.env.PARENT_GROUP_NAME || "";
  const groupDescription = process.env.GROUP_DESCRIPTION || "";

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

    // Check if group already exists
    const existingGroups = await kcAdminClient.groups.find({ search: groupName });
    const existingGroup = existingGroups.find(group => group.name === groupName);
    
    if (existingGroup) {
      console.log(`Group '${groupName}' already exists with ID: ${existingGroup.id}`);
      return;
    }

    // Find parent group if specified
    let parentGroupId: string | undefined;
    if (parentGroupName) {
      const parentGroups = await kcAdminClient.groups.find({ search: parentGroupName });
      const parentGroup = parentGroups.find(group => group.name === parentGroupName);
      if (!parentGroup) {
        throw new Error(`Parent group '${parentGroupName}' not found`);
      }
      parentGroupId = parentGroup.id;
    }

    // Create group payload
    const groupPayload = {
      name: groupName,
      ...(groupDescription && { attributes: { description: [groupDescription] } }),
    };

    // Create group
    const group = parentGroupId 
      ? await kcAdminClient.groups.createChildGroup({ id: parentGroupId }, groupPayload)
      : await kcAdminClient.groups.create(groupPayload);
    
    console.log(`Group '${groupName}' created successfully with ID: ${group.id}`);
    
    if (parentGroupName) {
      console.log(`Group '${groupName}' created as child of '${parentGroupName}'`);
    }
  } catch (error) {
    console.error("Error creating group:", error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
};

main();