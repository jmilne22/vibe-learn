import { UpdateError, updateCheckout } from "./update-checkout";

const args = process.argv.slice(2);
if (args.some((a) => a !== "--rebuild")) {
  console.error("Usage: npm run update:app [-- --rebuild]");
  process.exit(2);
}
console.log("Close Vibe Learn before updating so its files can be replaced.");
try {
  const result = updateCheckout({
    cwd: process.cwd(),
    rebuild: args.includes("--rebuild"),
  });
  if (result.packaged) console.log(`Updated app: ${result.app}`);
} catch (error) {
  if (!(error instanceof UpdateError)) throw error;
  console.error(error.message);
  process.exit(1);
}
