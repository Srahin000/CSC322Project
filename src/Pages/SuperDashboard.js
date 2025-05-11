import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../config/supabaseClient";

export default function SuperDashboard() {
  const [complaints, setComplaints] = useState([]);
  const [blacklistRequests, setBlacklistRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

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
    };

    fetchData();
  }, []);

  const handleResolveComplaint = async (complaint, action) => {
    const statusUpdate = action === "fine" ? "resolved" : "dismissed";

    await supabase
      .from("complaints")
      .update({ status: statusUpdate })
      .eq("id", complaint.id);

    if (action === "fine") {
      // Deduct 10 tokens from complained user
      await supabase.rpc("deduct_tokens", {
        user_id_param: complaint.complained_id,
        amount: 10,
      });
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
    if (action === "terminate") {
      await supabase.from("profiles").delete().eq("id", id);
    } else if (action === "suspend") {
      await supabase.from("profiles").update({ suspended: true }).eq("id", id);
    } else if (action === "unsuspend") {
      await supabase.from("profiles").update({ suspended: false }).eq("id", id);
    } else if (action === "fine") {
      await supabase.rpc("deduct_tokens", {
        user_id_param: id,
        amount: 10,
      });
    }

    const { data: updatedUsers } = await supabase
      .from("profiles")
      .select("id, email, tokens, suspended_until, role");

    setUsers(updatedUsers || []);
    window.location.reload();
  };

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-center">SuperUser Dashboard</h1>

      {/* Navigation */}
      <div className="flex gap-4 mb-6 justify-center">
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={() => navigate("/my-files")}>
          📂 My Files
        </button>
        <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={() => navigate("/editor")}>
          ✏️ Text Editor
        </button>
      </div>

      {/* Complaints */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Pending Complaints</h2>
        {complaints.length === 0 ? (
          <p>No pending complaints.</p>
        ) : (
          complaints.map((complaint) => (
            <div key={complaint.id} className="border p-4 mb-4">
              <p><strong>From:</strong> {complaint.complainant?.email}</p>
              <p><strong>Against:</strong> {complaint.complained?.email}</p>
              <p><strong>Reason:</strong> {complaint.reason}</p>
              <p><strong>Response:</strong> {complaint.response}</p>
              <p><strong>Text Title:</strong> {complaint.texts?.title}</p>
              <p><strong>Text:</strong> <em className="text-gray-700">{complaint.texts?.content?.slice(0, 200)}...</em></p>
              <div className="flex gap-2 mt-2">
                <button className="bg-red-500 text-white px-3 py-1 rounded" onClick={() => handleResolveComplaint(complaint, "fine")}>
                  Fine User (−10 tokens)
                </button>
                <button className="bg-gray-600 text-white px-3 py-1 rounded" onClick={() => handleResolveComplaint(complaint, "dismiss")}>
                  Dismiss Complaint
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Blacklist */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Pending Blacklist Requests</h2>
        {blacklistRequests.length === 0 ? (
          <p>No pending blacklist submissions.</p>
        ) : (
          blacklistRequests.map((request) => (
            <div key={request.id} className="border p-4 mb-4">
              <p><strong>Word:</strong> {request.word}</p>
              <div className="flex gap-2 mt-2">
                <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={() => handleBlacklistDecision(request.id, "approved")}>
                  Approve
                </button>
                <button className="bg-red-600 text-white px-3 py-1 rounded" onClick={() => handleBlacklistDecision(request.id, "rejected")}>
                  Reject
                </button>
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
  );
}
