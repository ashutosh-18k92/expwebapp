import { readFile } from "node:fs/promises";
import path from "node:path";

// Still public/<userId>/<fileName> - see SRS.md's storage-location
// limitation, unchanged by this feature.
export async function loadPolicyDocument(userId: string, fileName: string): Promise<Buffer> {
  const filePath = path.join(process.cwd(), "public", userId, fileName);
  return readFile(filePath);
}
