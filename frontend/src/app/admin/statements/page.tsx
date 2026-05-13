import * as practiceService from "@/lib/services/practice.service";
import { listImports } from "@/actions/bordereaux";
import { BordereauUpload } from "./bordereau-upload";
import { ImportHistory } from "./import-history";

export default async function AdminStatementsPage() {
  const [practices, imports] = await Promise.all([
    practiceService.listPractices(),
    listImports(),
  ]);

  return (
    <div className="space-y-8">
      <BordereauUpload practices={practices} />
      <ImportHistory imports={imports} />
    </div>
  );
}
