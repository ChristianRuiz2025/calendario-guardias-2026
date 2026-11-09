// Publica dist/ en el bucket del stack e invalida index.html en CloudFront.
// Uso: npm run deploy:front   (hace el build antes). Perfil: AWS_PROFILE (por defecto mfa-suscribe-stage).

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const STACK = process.env.STACK_NAME || "calendario-guardias-stage";
const PROFILE = process.env.AWS_PROFILE || "mfa-suscribe-stage";
const REGION = process.env.AWS_REGION || "us-east-1";

function aws(...args) {
  return execFileSync("aws", [...args, "--profile", PROFILE, "--region", REGION], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

if (!existsSync("dist/index.html")) {
  console.error("No existe dist/index.html: corre npm run build");
  process.exit(1);
}

const outputs = Object.fromEntries(
  JSON.parse(aws("cloudformation", "describe-stacks", "--stack-name", STACK, "--query", "Stacks[0].Outputs")).map(
    (o) => [o.OutputKey, o.OutputValue]
  )
);
const bucket = `s3://${outputs.FrontendBucketName}`;

// Archivos con hash: cache largo. index.html: siempre se revalida.
aws("s3", "sync", "dist", bucket, "--delete", "--exclude", "index.html",
  "--cache-control", "public,max-age=31536000,immutable");
aws("s3", "cp", "dist/index.html", `${bucket}/index.html`,
  "--cache-control", "no-cache", "--content-type", "text/html; charset=utf-8");
const invalidation = aws("cloudfront", "create-invalidation", "--distribution-id", outputs.DistributionId,
  "--paths", "/", "/index.html", "--query", "Invalidation.Id", "--output", "text").trim();

console.log(`Publicado en ${bucket} (invalidacion ${invalidation})\n${outputs.AppUrl}`);
