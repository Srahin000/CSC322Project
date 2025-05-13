import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../config/supabaseClient";
import SidebarMenu from "../Components/SidebarMenu";

export default function SuperDashboard() {
  const [complaints, setComplaints] = useState([]);
  const [blacklistRequests, setBlacklistRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [llmRejections, setLlmRejections] = useState([]);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("Not logged in!");
        navigate("/");
        return;
      }

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (userProfile.role !== "super") {
        alert("Access denied: Not a super user.");
        navigate("/");
        return;
      }

      // Fetch complaints + their text
      const { data: complaintsData } = await supabase
      .from("complaints")
      .select(`
        id,
        reason,
        status,
        text_id,
        response,
        complainant_id,
        complained_id,
        complainant:complainant_id (id, email),
        complained:complained_id (id, email),
        texts(title, content)
      `)      
      
        .eq("status", "pending");

      setComplaints(complaintsData || []);

      // Fetch blacklist suggestions
      const { data: blacklistData } = await supabase
        .from("blacklist_requests")
        .select("*")
        .eq("status", "pending");

      setBlacklistRequests(blacklistData || []);

      // Fetch all users
      const { data: usersData } = await supabase
        .from("profiles")
        .select("id, email, tokens, suspended, role");

      setUsers(usersData || []);

      // Fetch LLM rejections
      const { data: rejectionsData } = await supabase
        .from("llm_rejections")
        .select(`
          id,
          user_id,
          text_id,
          original_text,
          llm_output,
          reason,
          status,
          created_at,
          profiles!user_id (email)
        `)
        .eq("status", "pending");

      setLlmRejections(rejectionsData || []);
    };

    fetchData();
  }, []);

  const handleResolveComplaint = async (complaint, action) => {
    const statusUpdate = action === "fine" ? "resolved" : "dismissed";

    await supabase
      .from("complaints")
      .update({ status: statusUpdate })
      .eq("id", complaint.id);

    // Set complaint to false for the complained user
    await supabase
      .from("profiles")
      .update({ complaint: false })
      .eq("id", complaint.complained_id);

    if (action === "fine") {
      // Get current tokens
      const { data: userData } = await supabase
        .from("profiles")
        .select("tokens")
        .eq("id", complaint.complained_id)
        .single();

      if (userData) {
        // Deduct 10 tokens from complained user
        await supabase
          .from("profiles")
          .update({ tokens: Math.max(0, userData.tokens - 10) })
          .eq("id", complaint.complained_id);
      }
    }

    setComplaints(prev => prev.filter(c => c.id !== complaint.id));
  };

  const handleBlacklistDecision = async (id, decision) => {
    await supabase
      .from("blacklist_requests")
      .update({ status: decision })
      .eq("id", id);

    setBlacklistRequests(prev => prev.filter(b => b.id !== id));
  };

  const handleUserAction = async (id, action) => {
    try {
      if (action === "terminate") {
        await supabase.from("profiles").delete().eq("id", id);
      } else if (action === "suspend") {
        await supabase.from("profiles").update({ suspended: true }).eq("id", id);
      } else if (action === "unsuspend") {
        await supabase.from("profiles").update({ suspended: false }).eq("id", id);
      } else if (action === "fine") {
        // Get current tokens
        const { data: userData, error: userError } = await supabase
          .from("profiles")
          .select("tokens")
          .eq("id", id)
          .single();

        if (userError) {
          throw new Error("Failed to fetch user data");
        }

        if (userData) {
          // Deduct 10 tokens
          const { error: updateError } = await supabase
            .from("profiles")
            .update({ tokens: Math.max(0, userData.tokens - 10) })
            .eq("id", id);

          if (updateError) {
            throw new Error("Failed to update tokens");
          }
        }
      }

      // Refresh the users list after any action
      const { data: updatedUsers, error: fetchError } = await supabase
        .from("profiles")
        .select("id, email, tokens, suspended, role");

      if (fetchError) {
        throw new Error("Failed to refresh user list");
      }

      setUsers(updatedUsers || []);
      
      // Show success message
      alert(`User ${action} action completed successfully`);
    } catch (error) {
      console.error("Error handling user action:", error);
      alert(`Failed to ${action} user: ${error.message}`);
    }
  };

  const handleLlmRejection = async (rejection, action) => {
    const penalty = action === "approve" ? 1 : 5;
    const status = action === "approve" ? "approved" : "rejected";

    try {
      // Update rejection status
      const { error: rejectionError } = await supabase
        .from("llm_rejections")
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          penalty
        })
        .eq("id", rejection.id);

      if (rejectionError) throw rejectionError;

      // Deduct tokens from user
      const { data: userData } = await supabase
        .from("profiles")
        .select("tokens")
        .eq("id", rejection.user_id)
        .single();

      if (userData) {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ tokens: Math.max(0, userData.tokens - penalty) })
          .eq("id", rejection.user_id);

        if (updateError) throw updateError;
      }

      // Update local state
      setLlmRejections(prev => prev.filter(r => r.id !== rejection.id));
    } catch (error) {
      console.error("Error handling LLM rejection:", error);
      alert("Failed to process rejection. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-blue-50">
      <SidebarMenu sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className={`transition-all duration-200 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        <div className="p-6">
          <div className="bg-white rounded-xl shadow p-8">
            <h1 className="text-3xl font-extrabold mb-8 text-blue-800 text-center">SuperUser Dashboard</h1>

            {/* LLM Rejections */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4 text-blue-800">Pending LLM Rejections</h2>
              {llmRejections.length === 0 ? (
                <p className="text-blue-700">No pending LLM rejections.</p>
              ) : (
                llmRejections.map((rejection) => (
                  <div key={rejection.id} className="border border-blue-100 p-6 mb-4 rounded-xl shadow-sm bg-blue-50">
                    <p><strong>From:</strong> {rejection.profiles?.email}</p>
                    <p><strong>Original Text:</strong> <em className="text-blue-700">{rejection.original_text}</em></p>
                    <p><strong>LLM Output:</strong> <em className="text-blue-700">{rejection.llm_output}</em></p>
                    <p><strong>Rejection Reason:</strong> {rejection.reason}</p>
                    <p><strong>Submitted:</strong> {new Date(rejection.created_at).toLocaleString()}</p>
                    <div className="flex gap-2 mt-2">
                      <button 
                        className="bg-green-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-600 transition"
                        onClick={() => handleLlmRejection(rejection, "approve")}
                      >
                        Approve (−1 token)
                      </button>
                      <button 
                        className="bg-red-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-600 transition"
                        onClick={() => handleLlmRejection(rejection, "reject")}
                      >
                        Reject (−5 tokens)
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* Complaints */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4 text-blue-800">Pending Complaints</h2>
              {complaints.length === 0 ? (
                <p className="text-blue-700">No pending complaints.</p>
              ) : (
                complaints.map((complaint) => (
                  <div key={complaint.id} className="border border-blue-100 p-6 mb-4 rounded-xl shadow-sm bg-blue-50">
                    <p><strong>From:</strong> {complaint.complainant?.email}</p>
                    <p><strong>Against:</strong> {complaint.complained?.email}</p>
                    <p><strong>Reason:</strong> {complaint.reason}</p>
                    <p><strong>Response:</strong> {complaint.response}</p>
                    <p><strong>Text Title:</strong> {complaint.texts?.title}</p>
                    <p><strong>Text:</strong> <em className="text-blue-700">{complaint.texts?.content?.slice(0, 200)}...</em></p>
                    <div className="flex gap-2 mt-2">
                      <button className="bg-red-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-600 transition" onClick={() => handleResolveComplaint(complaint, "fine")}>Fine User (−10 tokens)</button>
                      <button className="bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-700 transition" onClick={() => handleResolveComplaint(complaint, "dismiss")}>Dismiss Complaint</button>
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* Blacklist */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4 text-blue-800">Pending Blacklist Requests</h2>
              {blacklistRequests.length === 0 ? (
                <p className="text-blue-700">No pending blacklist submissions.</p>
              ) : (
                blacklistRequests.map((request) => (
                  <div key={request.id} className="border border-blue-100 p-6 mb-4 rounded-xl shadow-sm bg-blue-50">
                    <p><strong>Word:</strong> {request.word}</p>
                    <div className="flex gap-2 mt-2">
                      <button className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition" onClick={() => handleBlacklistDecision(request.id, "approved")}>Approve</button>
                      <button className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition" onClick={() => handleBlacklistDecision(request.id, "rejected")}>Reject</button>
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* Users */}
            <section>
              <h2 className="text-xl font-semibold mb-4">Manage Users</h2>
              {users.length === 0 ? (
                <p>No users available.</p>
              ) : (
                users.map((user) => (
                  <div key={user.id} className="border p-4 mb-4">
                    <p><strong>Email:</strong> {user.email}</p>
                    <p><strong>Tokens:</strong> {user.tokens}</p>
                    <p><strong>Suspended:</strong> {user.suspended ? "Yes" : "No"}</p>
                    <div className="flex gap-2 mt-2">
                      <button className="bg-red-700 text-white px-3 py-1 rounded" onClick={() => handleUserAction(user.id, "terminate")}>
                        ❌ Terminate
                      </button>
                      {user.suspended ? (
                          <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={() => handleUserAction(user.id, "unsuspend")}>
                            ✅ Unsuspend
                          </button>
                        ) : (
                          <button className="bg-yellow-500 text-white px-3 py-1 rounded" onClick={() => handleUserAction(user.id, "suspend")}>
                            ⏸ Suspend
                          </button>
                        )}
                      <button className="bg-purple-600 text-white px-3 py-1 rounded" onClick={() => handleUserAction(user.id, "fine")}>
                        💸 Fine 10 Tokens
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
