import * as practiceService from "@/lib/services/practice.service";
import * as adminService from "@/lib/services/admin.service";
import { listImports } from "@/actions/bordereaux";
import { BordereauUpload } from "./bordereau-upload";
import { ImportHistory } from "./import-history";

export default async function AdminStatementsPage() {
  const [practices, practitioners, imports] = await Promise.all([
    practiceService.listPractices(),
    adminService.listPractitioners(),
    listImports(),
  ]);

  return (
    <div className="space-y-8">
      <BordereauUpload
        practices={practices}
        practitioners={practitioners.map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
        }))}
      />
      <ImportHistory imports={imports} />
    </div>
  );
}
