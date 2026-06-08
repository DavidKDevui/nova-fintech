"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import { createUserAction, cancelInvitationAction } from "@/actions/admin";
import { Button } from "@/components/button";
import { toast } from "sonner";

export interface Invitation {
  id: string;
  email: string;
  accountType: string;
  createdAt: Date;
  expiresAt: Date;
}

function timeRemaining(expiresAt: Date): string {
  const now = Date.now();
  const diff = new Date(expiresAt).getTime() - now;
  if (diff <= 0) return "Expire";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

export function InvitationsSection({
  initialInvitations,
  accountType,
}: {
  initialInvitations: Invitation[];
  accountType: "practitioner" | "admin";
}) {
  const label = accountType === "admin" ? "un administrateur" : "un praticien";
  const [invitations, setInvitations] = useState(initialInvitations);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [state, action, pending] = useActionState(createUserAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success && state.invitation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- append on useActionState success
      setInvitations((prev) => [...prev, state.invitation]);
      toast.success(`Invitation envoyée à ${state.invitation.email}`);
      formRef.current?.reset();
    }
    if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  async function handleCancel(id: string) {
    setCancellingId(id);
    const result = await cancelInvitationAction(id);
    setCancellingId(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setInvitations((prev) => prev.filter((inv) => inv.id !== id));
    toast.success("Invitation annulée");
  }

  return (
    <>
      {/* Formulaire d'invitation */}
      <div className="mb-8 bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-4 md:p-6">
        <h2 className="text-lg font-semibold mb-4">Inviter {label}</h2>
        <form ref={formRef} action={action} className="flex flex-col sm:flex-row gap-3">
          <input
            name="email"
            type="email"
            placeholder="email@exemple.com"
            required
            className="flex-1 border border-ardoise-200/50 bg-white/50 px-4 py-2.5 text-sm rounded-md backdrop-blur-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <input type="hidden" name="accountType" value={accountType} />
          <Button
            variant="cta"
            type="submit"
            disabled={pending}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            {pending ? "Envoi..." : "Inviter"}
          </Button>
        </form>
      </div>

      {/* Liste des invitations en attente */}
      {invitations.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ardoise-400 mb-3">
            Invitations en attente ({invitations.length})
          </h2>
          <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-ardoise-200/50 text-left text-ardoise-500">
                  <th className="px-4 md:px-6 py-4 font-medium">Email</th>
                  <th className="px-4 md:px-6 py-4 font-medium">Expire dans</th>
                  <th className="px-4 md:px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} className="border-b border-ardoise-100/50 last:border-0 transition-colors hover:bg-white/40">
                    <td className="px-4 md:px-6 py-4 font-medium">{inv.email}</td>
                    <td className="px-4 md:px-6 py-4 text-ardoise-500">
                      {timeRemaining(inv.expiresAt)}
                    </td>
                    <td className="px-4 md:px-6 py-4 text-right">
                      <button
                        onClick={() => handleCancel(inv.id)}
                        disabled={cancellingId === inv.id}
                        className="p-1.5 text-red-500 rounded-md hover:bg-red-50 hover:text-red-700 disabled:opacity-50 transition-all"
                        title="Annuler l'invitation"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
