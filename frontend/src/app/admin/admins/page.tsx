import * as adminService from "@/lib/services/admin.service";
import { InvitationsSection } from "../users/pending-invitations";
import { UserTable } from "../users/user-table";

export default async function AdminAdminsPage() {
  const [allUsers, pendingInvitations] = await Promise.all([
    adminService.listUsers(),
    adminService.listPendingInvitations("admin"),
  ]);
  const admins = allUsers.filter((u) => u.accountType === "admin");

  return (
    <div>
      <InvitationsSection initialInvitations={pendingInvitations} />
      <UserTable users={admins} emptyMessage="Aucun administrateur" />
    </div>
  );
}
