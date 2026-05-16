import * as adminService from "@/lib/services/admin.service";
import { InvitationsSection } from "./pending-invitations";
import { PractitionerTable } from "./practitioner-table";

export default async function AdminPractitionersPage() {
  const [practitioners, pendingInvitations] = await Promise.all([
    adminService.listPractitioners(),
    adminService.listPendingInvitations("practitioner"),
  ]);

  return (
    <div>
      <InvitationsSection initialInvitations={pendingInvitations} accountType="practitioner" />
      <PractitionerTable practitioners={practitioners} />
    </div>
  );
}
