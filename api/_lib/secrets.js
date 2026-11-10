// Carga el secreto de la app (Secrets Manager, JSON plano) en process.env una sola vez por
// contenedor de Lambda, para que el resto del codigo siga leyendo process.env como siempre.
// Variable: APP_SECRET_ARN. Sin ella (desarrollo local) no hace nada.

import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

let loading = null;

export function loadSecrets() {
  const secretId = process.env.APP_SECRET_ARN;
  if (!secretId) {
    return Promise.resolve();
  }
  if (!loading) {
    loading = new SecretsManagerClient({})
      .send(new GetSecretValueCommand({ SecretId: secretId }))
      .then(({ SecretString }) => {
        for (const [key, value] of Object.entries(JSON.parse(SecretString ?? "{}"))) {
          if (value !== null && value !== undefined) {
            process.env[key] = String(value);
          }
        }
      })
      .catch((error) => {
        loading = null; // reintentar en la siguiente invocacion
        throw error;
      });
  }
  return loading;
}
