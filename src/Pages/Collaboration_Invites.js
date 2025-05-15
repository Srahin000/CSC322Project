// Import React hooks and necessary modules
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../config/supabaseClient";
import SidebarMenu from "../Components/SidebarMenu";

// Main component for displaying and handling collaboration invites
export default function Collaboration_Invites() {
  // State to store the list of invites
  const [invites, setInvites] = useState([]);
  // Loading state for showing spinner or message while data is being fetched
  const [loading, setLoading] = useState(true);
  // State for controlling the sidebar visibility
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate(); // React Router hook for navigation

  // useEffect runs once when the component mounts
  useEffect(() => {
    fetchInvites();
  }, []);

  // Function to fetch collaboration invites from the database
  const fetchInvites = async () => {
    try {
      // Get current session (user authentication)
      const { data: { session } } = await supabase.auth.getSession();
      
      // If no session, redirect to home/login
      if (!session) {
        navigate("/");
        return;
      }

      // Fetch pending invites where the current user is the invitee
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
      
      // Update state with the received invites
      setInvites(invitesData || []);
    } catch (error) {
      console.error("Error fetching invites:", error);
      alert("Error loading invites");
    } finally {
      setLoading(false); // Turn off loading state
    }
  };

  // Handle user's response to an invite (accept or reject)
  const handleInviteResponse = async (inviteId, accept) => {
    try {
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (accept) {
        // Accept the invite by updating its status
        await supabase
          .from("collaboration_invites")
          .update({ status: "accepted" })
          .eq("id", inviteId);

        // Fetch related file and inviter IDs
        const { data: invite } = await supabase
          .from("collaboration_invites")
          .select("file_id, inviter_id")
          .eq("id", inviteId)
          .single();

        if (invite) {
          // Add user as a collaborator to the file
          await supabase
            .from("text_collaborators")
            .insert({
              text_id: invite.file_id,
              user_id: session.user.id,
              adder_id: invite.inviter_id,
            });
        }
      } else {
        // If rejected, deduct tokens from inviter as penalty
        const { data: invite } = await supabase
          .from("collaboration_invites")
          .select("inviter_id")
          .eq("id", inviteId)
          .single();

        if (invite) {
          // Fetch inviter's current token count
          const { data: inviterData } = await supabase
            .from("profiles")
            .select("tokens")
            .eq("id", invite.inviter_id)
            .single();

          if (inviterData) {
            // Deduct 3 tokens, but don't go below zero
            await supabase
              .from("profiles")
              .update({ tokens: Math.max(0, inviterData.tokens - 3) })
              .eq("id", invite.inviter_id);
          }
        }

        // Mark the invite as rejected
        await supabase
          .from("collaboration_invites")
          .update({ status: "rejected" })
          .eq("id", inviteId);
      }

      // Refresh invite list after handling
      fetchInvites();
    } catch (error) {
      console.error("Error handling invite response:", error);
      alert("Error processing invite response");
    }
  };

  // Show loading state while data is being fetched
  if (loading) {
    return <div className="p-4">Loading invites...</div>;
  }

  // UI rendering for invite list
  return (
    <div className="relative flex h-screen w-screen bg-blue-50">
      {/* Sidebar menu component */}
      <SidebarMenu sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="flex-1 p-4 transition-all duration-200 w-full">
        <div className="bg-white rounded-xl shadow p-8 w-full h-full">
          <h1 className="text-2xl font-extrabold mb-6 text-blue-800">Collaboration Invites</h1>

          {/* If no invites */}
          {invites.length === 0 ? (
            <p>No pending invites.</p>
          ) : (
            <div className="space-y-4">
              {/* Render each invite */}
              {invites.map((invite) => (
                <div key={invite.id} className="border p-4 rounded-lg shadow-sm bg-blue-50">
                  <div className="mb-4">
                    <p className="font-semibold">From: {invite.inviter?.email}</p>
                    <p className="text-blue-700">File: {invite.file?.title}</p>
                    <p className="text-sm text-blue-500">
                      Sent: {new Date(invite.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {/* Accept / Reject buttons */}
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
