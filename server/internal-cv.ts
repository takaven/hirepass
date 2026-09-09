import type { PoolClient } from "pg";
import { pool } from "./db";
import { removeStoredCandidateDocument, storeCandidateCvUpload } from "./document-files";

export type InternalCvInput = {
  fileName: string;
  mimeType?: string;
  fileDataBase64: string;
};

export async function saveInternalCandidateCv(candidateId: number, input: InternalCvInput) {
  const upload = await storeCandidateCvUpload({ candidateId, ...input });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("begin");
    const candidate = await client.query("select id from candidates where id=$1 for update", [candidateId]);
    if (!candidate.rows[0]) throw new Error("Candidate not found");
    await client.query(
      `insert into documents (candidate_id,doc_type,title,file_path,file_name,status)
       values ($1,'cv','Candidate CV',$2,$3,'submitted')`,
      [candidateId, upload.storageKey, upload.originalName],
    );
    const updated = await client.query(
      "update candidates set cv_file_path=$2,cv_file_name=$3,updated_at=now() where id=$1 returning id",
      [candidateId, upload.storageKey, upload.originalName],
    );
    if (!updated.rows[0]) throw new Error("Failed to record current CV");
    await client.query("commit");
    return { fileName: upload.originalName, size: upload.size, storageKey: upload.storageKey };
  } catch (error) {
    await client?.query("rollback").catch(() => undefined);
    await removeStoredCandidateDocument(upload.storageKey);
    throw error;
  } finally {
    client?.release();
  }
}
