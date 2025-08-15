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

    // Find group to delete
    const groups = await kcAdminClient.groups.find({ search: groupName });
    const group = groups.find(g => g.name === groupName);
    
    if (!group) {
      console.log(`Group '${groupName}' not found`);
      return;
    }

    // Check if group has members
    const groupMembers = await kcAdminClient.groups.listMembers({ id: group.id! });
    if (groupMembers.length > 0) {
      console.log(`Warning: Group '${groupName}' has ${groupMembers.length} members:`);
      groupMembers.forEach(member => {
        console.log(`  - ${member.username} (${member.firstName} ${member.lastName})`);
      });
      console.log("All members will be removed from the group when it's deleted.");
    }

    // Check for subgroups
    const subGroups = await kcAdminClient.groups.listSubGroups({ id: group.id! });
    if (subGroups.length > 0) {
      console.log(`Warning: Group '${groupName}' has ${subGroups.length} subgroups:`);
      subGroups.forEach(subGroup => {
        console.log(`  - ${subGroup.name}`);
      });
      console.log("All subgroups will be deleted as well.");
    }

    // Delete group
    await kcAdminClient.groups.del({ id: group.id! });

    console.log(`Group '${groupName}' deleted successfully`);
  } catch (error) {
    console.error("Error deleting group:", error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
};

main();