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

  const email = process.env.EMAIL;
  const firstName = process.env.FIRST_NAME;
  const lastName = process.env.LAST_NAME;

  const password = process.env.PASSWORD;
  invariant(password, "PASSWORD environment variable is required");

  const createAsAdmin = process.env.CREATE_AS_ADMIN === "true";

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

    const userPayload = {
      username,
      email,
      emailVerified: true,
      firstName,
      lastName,
      enabled: true,
    };
    const user = await kcAdminClient.users.create(userPayload);
    console.log(`User created successfully with ID: ${user.id}`);

    if (createAsAdmin && realmName === "master") {
      const adminRole = await kcAdminClient.roles.findOneByName({
        realm: "master",
        name: "admin",
      });

      const createRealmRole = await kcAdminClient.roles.findOneByName({
        realm: "master",
        name: "create-realm",
      });

      await kcAdminClient.users.addRealmRoleMappings({
        realm: "master",
        id: user.id,
        roles: [
          {
            id: adminRole!.id!,
            name: adminRole!.name!,
          },
          {
            id: createRealmRole!.id!,
            name: createRealmRole!.name!,
          },
        ],
      });
    }

    await kcAdminClient.users.resetPassword({
      id: user.id!,
      credential: {
        type: "password",
        value: password,
        temporary: false,
      },
    });
    console.log(`Password set for user '${user.id}'.`);
  } catch (error) {
    console.error("Error creating user:", error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
};

main();
