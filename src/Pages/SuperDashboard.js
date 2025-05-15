// Admin dashboard for managing complaints, blacklist requests, and users
// Provides tools to resolve issues and moderate platform content

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../config/supabaseClient";
import SidebarMenu from "../Components/SidebarMenu";

export default function SuperDashboard() {
  // State for storing different types of admin data
  const [complaints, setComplaints] = useState([]);
  const [blacklistRequests, setBlacklistRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [llmRejections, setLlmRejections] = useState([]);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Fetch all admin data on component mount
  useEffect(() => {
    const fetchData = async () => {
      // Check user authentication and superuser status
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("Not logged in!");
        navigate("/");
        return;
      }

      // Verify user has superuser role
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

      // Fetch pending complaints with related data
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

      // Fetch pending blacklist requests
      const { data: blacklistData } = await supabase
        .from("blacklist_requests")
        .select("*")
        .eq("status", "pending");

      setBlacklistRequests(blacklistData || []);

      // Fetch all user profiles
      const { data: usersData } = await supabase
        .from("profiles")
        .select("id, email, tokens, suspended, role");

      setUsers(usersData || []);

      // Fetch pending LLM rejections with user info
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

  // Handle complaint resolution (fine or dismiss)
  const handleResolveComplaint = async (complaint, action) => {
    const statusUpdate = action === "fine" ? "resolved" : "dismissed";

    // Update complaint status
    await supabase
      .from("complaints")
      .update({ status: statusUpdate })
      .eq("id", complaint.id);

    // Clear complaint flag for complained user
    await supabase
      .from("profiles")
      .update({ complaint: false })
      .eq("id", complaint.complained_id);

    // Apply token penalties based on action
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
    } else if (action === "dismiss") {
      // Get complainant's current tokens
      const { data: complainantData } = await supabase
        .from("profiles")
        .select("tokens")
        .eq("id", complaint.complainant_id)
        .single();

      if (complainantData) {
        // Deduct 10 tokens from complainant
        await supabase
          .from("profiles")
          .update({ tokens: Math.max(0, complainantData.tokens - 10) })
          .eq("id", complaint.complainant_id);
      }
    }

    // Remove resolved complaint from local state
    setComplaints(prev => prev.filter(c => c.id !== complaint.id));
  };

  // Approve or reject blacklist requests
  const handleBlacklistDecision = async (id, decision) => {
    await supabase
      .from("blacklist_requests")
      .update({ status: decision })
      .eq("id", id);

    // Remove processed request from local state
    setBlacklistRequests(prev => prev.filter(b => b.id !== id));
  };

  // Handle various user management actions
  const handleUserAction = async (id, action) => {
    try {
      // Execute different actions based on parameter
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

      // Refresh user list after action
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

  // Handle LLM rejection decisions
  const handleLlmRejection = async (rejection, action) => {
    const penalty = action === "approve" ? 1 : 5;
    const status = action === "approve" ? "approved" : "rejected";

    try {
      // Update rejection status and penalty
      const { error: rejectionError } = await supabase
        .from("llm_rejections")
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          penalty
        })
        .eq("id", rejection.id);

        if (rejectionError) throw rejectionError;
      // Apply token penalty to user
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

      // Remove processed rejection from local state
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

            {/* LLM Rejections Section */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4 text-blue-800">Pending LLM Rejections</h2>
              {llmRejections.length === 0 ? (
                <p className="text-blue-700">No pending LLM rejections.</p>
              ) : (
                llmRejections.map((rejection) => (
                  <div key={rejection.id} className="border border-blue-100 p-6 mb-4 rounded-xl shadow-sm bg-blue-50">
                    {/* Rejection details and action buttons */}
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

            {/* Complaints Section */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4 text-blue-800">Pending Complaints</h2>
              {complaints.length === 0 ? (
                <p className="text-blue-700">No pending complaints.</p>
              ) : (
                complaints.map((complaint) => (
                  <div key={complaint.id} className="border border-blue-100 p-6 mb-4 rounded-xl shadow-sm bg-blue-50">
                    {/* Complaint details and resolution buttons */}
                    <p><strong>From:</strong> {complaint.complainant?.email}</p>
                    <p><strong>Against:</strong> {complaint.complained?.email}</p>
                    <p><strong>Reason:</strong> {complaint.reason}</p>
                    <p><strong>Response:</strong> {complaint.response}</p>
                    <p><strong>Text Title:</strong> {complaint.texts?.title}</p>
                    <p><strong>Text:</strong> <em className="text-blue-700">{complaint.texts?.content?.slice(0, 200)}...</em></p>
                    <div className="flex gap-2 mt-2">
                      <button className="bg-red-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-600 transition" onClick={() => handleResolveComplaint(complaint, "fine")}>Fine User (−10 for complained)</button>
                      <button className="bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-700 transition" onClick={() => handleResolveComplaint(complaint, "dismiss")}>Dismiss Complaint (-10 for complainer)</button>
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* Blacklist Requests Section */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4 text-blue-800">Pending Blacklist Requests</h2>
              {blacklistRequests.length === 0 ? (
                <p className="text-blue-700">No pending blacklist submissions.</p>
              ) : (
                blacklistRequests.map((request) => (
                  <div key={request.id} className="border border-blue-100 p-6 mb-4 rounded-xl shadow-sm bg-blue-50">
                    {/* Blacklist word and decision buttons */}
                    <p><strong>Word:</strong> {request.word}</p>
                    <div className="flex gap-2 mt-2">
                      <button className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition" onClick={() => handleBlacklistDecision(request.id, "approved")}>Approve</button>
                      <button className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition" onClick={() => handleBlacklistDecision(request.id, "rejected")}>Reject</button>
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* User Management Section */}
            <section>
              <h2 className="text-xl font-semibold mb-4">Manage Users</h2>
              {users.length === 0 ? (
                <p>No users available.</p>
              ) : (
                users.map((user) => (
                  <div key={user.id} className="border p-4 mb-4">
                    {/* User info and management buttons */}
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
