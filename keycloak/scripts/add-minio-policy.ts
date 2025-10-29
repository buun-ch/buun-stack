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

  const minioClientId = process.env.MINIO_OIDC_CLIENT_ID;
  invariant(minioClientId, "MINIO_OIDC_CLIENT_ID environment variable is required");

  const policyValue = process.env.MINIO_POLICY || "readwrite";
  console.log(`Setting minioPolicy attribute with value: ${policyValue}`);

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

    kcAdminClient.setConfig({
      realmName,
    });

    const userProfile = await kcAdminClient.users.getProfile();

    const existingAttribute = userProfile.attributes?.find(
      (attr: any) => attr.name === "minioPolicy"
    );

    if (existingAttribute) {
      console.log("minioPolicy attribute already exists in User Profile.");
    } else {
      if (!userProfile.attributes) {
        userProfile.attributes = [];
      }
      userProfile.attributes.push({
        name: "minioPolicy",
        displayName: "MinIO Policy",
        permissions: {
          view: ["admin", "user"],
          edit: ["admin"],
        },
        validations: {
          options: { options: ["readwrite", "readonly", "writeonly"] },
        },
      });

      await kcAdminClient.users.updateProfile(userProfile);
      console.log(
        "minioPolicy attribute added to User Profile successfully with admin edit permissions."
      );
    }

    const minioClient = await kcAdminClient.clients.find({
      clientId: minioClientId,
    });
    if (minioClient.length === 0) {
      console.error(`Client '${minioClientId}' not found.`);
      // eslint-disable-next-line unicorn/no-process-exit
      process.exit(1);
    }
    const clientId = minioClient[0].id;
    invariant(clientId, "Client ID is required");

    const mappers = await kcAdminClient.clients.listProtocolMappers({
      id: clientId,
    });
    const existingMapper = mappers.find((mapper) => mapper.name === "MinIO Policy");

    if (existingMapper) {
      console.log("MinIO Policy mapper already exists.");
    } else {
      await kcAdminClient.clients.addProtocolMapper(
        { id: clientId },
        {
          name: "MinIO Policy",
          protocol: "openid-connect",
          protocolMapper: "oidc-usermodel-attribute-mapper",
          config: {
            "userinfo.token.claim": "true",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "claim.name": "minioPolicy",
            "jsonType.label": "String",
            "user.attribute": "minioPolicy",
            multivalued: "false",
          },
        }
      );
      console.log("MinIO Policy mapper created successfully.");
    }
  } catch (error) {
    console.error("An error occurred:", error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
};

main();
