import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../config/supabaseClient";
import SidebarMenu from "../Components/SidebarMenu";

export default function Collaboration_Invites() {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchInvites();
  }, []);

  const fetchInvites = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/");
        return;
      }

      // Fetch pending invites for the current user
      const { data: invitesData, error } = await supabase
        .from("collaboration_invites")
        .select(`
          id,
          status,
          created_at,
          inviter:inviter_id (id, email),
          file:file_id (id, title, content)
        `)
        .eq("invitee_id", session.user.id)
        .eq("status", "pending");

      if (error) throw error;
      setInvites(invitesData || []);
    } catch (error) {
      console.error("Error fetching invites:", error);
      alert("Error loading invites");
    } finally {
      setLoading(false);
    }
  };

  const handleInviteResponse = async (inviteId, accept) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (accept) {
        // Accept the invite
        await supabase
          .from("collaboration_invites")
          .update({ status: "accepted" })
          .eq("id", inviteId);

        // Fetch file_id and inviter_id from the invite
        const { data: invite } = await supabase
          .from("collaboration_invites")
          .select("file_id, inviter_id")
          .eq("id", inviteId)
          .single();

        if (invite) {
          await supabase
            .from("text_collaborators")
            .insert({
              text_id: invite.file_id,
              user_id: session.user.id,
              adder_id: invite.inviter_id,
            });
        }
      } else {
        // Reject the invite and deduct tokens from inviter
        const { data: invite } = await supabase
          .from("collaboration_invites")
          .select("inviter_id")
          .eq("id", inviteId)
          .single();

        if (invite) {
          // Get inviter's current tokens
          const { data: inviterData } = await supabase
            .from("profiles")
            .select("tokens")
            .eq("id", invite.inviter_id)
            .single();

          if (inviterData) {
            // Deduct 3 tokens from inviter for reckless inviting
            await supabase
              .from("profiles")
              .update({ tokens: Math.max(0, inviterData.tokens - 3) })
              .eq("id", invite.inviter_id);
          }
        }

        await supabase
          .from("collaboration_invites")
          .update({ status: "rejected" })
          .eq("id", inviteId);
      }

      // Refresh invites list
      fetchInvites();
    } catch (error) {
      console.error("Error handling invite response:", error);
      alert("Error processing invite response");
    }
  };

  if (loading) {
    return <div className="p-4">Loading invites...</div>;
  }

  return (
    <div className="relative flex h-screen w-screen bg-blue-50">
      <SidebarMenu sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="flex-1 p-4 transition-all duration-200 w-full">
        <div className="bg-white rounded-xl shadow p-8 w-full h-full">
          <h1 className="text-2xl font-extrabold mb-6 text-blue-800">Collaboration Invites</h1>
          {invites.length === 0 ? (
            <p>No pending invites.</p>
          ) : (
            <div className="space-y-4">
              {invites.map((invite) => (
                <div key={invite.id} className="border p-4 rounded-lg shadow-sm bg-blue-50">
                  <div className="mb-4">
                    <p className="font-semibold">From: {invite.inviter?.email}</p>
                    <p className="text-blue-700">File: {invite.file?.title}</p>
                    <p className="text-sm text-blue-500">
                      Sent: {new Date(invite.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleInviteResponse(invite.id, true)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleInviteResponse(invite.id, false)}
                      className="bg-blue-400 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-500 transition"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
