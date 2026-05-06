interface User {
  id: string;
  email: string;
  accountType: string;
  isVerified: boolean;
  createdAt: Date;
  deletedAt: Date | null;
}

export function UserTable({ users, emptyMessage }: { users: User[]; emptyMessage: string }) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg overflow-x-auto">
      <table className="w-full text-sm min-w-[500px]">
        <thead>
          <tr className="border-b border-gray-200/50 text-left text-gray-500">
            <th className="px-4 md:px-6 py-4 font-medium">Email</th>
            <th className="px-4 md:px-6 py-4 font-medium">Statut</th>
            <th className="px-4 md:px-6 py-4 font-medium">Date de creation</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-gray-100/50 last:border-0 transition-colors hover:bg-white/40">
              <td className="px-4 md:px-6 py-4 font-medium">{user.email}</td>
              <td className="px-4 md:px-6 py-4">
                {user.deletedAt ? (
                  <span className="inline-block rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600">Supprime</span>
                ) : user.isVerified ? (
                  <span className="inline-block rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600">Actif</span>
                ) : (
                  <span className="inline-block rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600">En attente</span>
                )}
              </td>
              <td className="px-4 md:px-6 py-4 text-gray-500">
                {new Date(user.createdAt).toLocaleDateString("fr-FR")}
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 md:px-6 py-8 text-center text-gray-400">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
