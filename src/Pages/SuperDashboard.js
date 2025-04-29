import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../config/supabaseClient";

export default function SuperDashboard() {
  const [complaints, setComplaints] = useState([]);
  const [blacklistRequests, setBlacklistRequests] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("Not logged in!");
        navigate("/");
        return;
      }

      // Check if Super User
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (userProfile.role !== 'super') {
        alert("Access denied: Not a super user.");
        navigate("/");
        return;
      }

      // Fetch pending complaints
      const { data: complaintsData } = await supabase
        .from('complaints')
        .select('*')
        .eq('status', 'pending');

      setComplaints(complaintsData || []);

      // Fetch pending blacklist suggestions
      const { data: blacklistData } = await supabase
        .from('blacklist_requests')
        .select('*')
        .eq('status', 'pending');

      setBlacklistRequests(blacklistData || []);
    };

    fetchData();
  }, []);

  const handleResolveComplaint = async (id, action) => {
    const fine = action === 'fine' ? 5 : 0; // You can deduct tokens if you want
    const statusUpdate = action === 'fine' ? 'resolved' : 'dismissed';

    await supabase
      .from('complaints')
      .update({ status: statusUpdate })
      .eq('id', id);

    // Refresh after action
    setComplaints(prev => prev.filter(c => c.id !== id));
  };

  const handleBlacklistDecision = async (id, decision) => {
    await supabase
      .from('blacklist_requests')
      .update({ status: decision })
      .eq('id', id);

    // Refresh after action
    setBlacklistRequests(prev => prev.filter(b => b.id !== id));
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-center">SuperUser Dashboard</h1>

      {/* Navigation */}
      <div className="flex gap-4 mb-6 justify-center">
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={() => navigate("/my-files")}
        >
          📂 My Files
        </button>
        <button
          className="bg-green-600 text-white px-4 py-2 rounded"
          onClick={() => navigate("/editor")}
        >
          ✏️ Text Editor
        </button>
      </div>

      {/* Complaints Section */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Pending Complaints</h2>
        {complaints.length === 0 ? (
          <p>No pending complaints.</p>
        ) : (
          complaints.map(complaint => (
            <div key={complaint.id} className="border p-4 mb-4 flex flex-col">
              <p><strong>Complaint Reason:</strong> {complaint.reason}</p>
              <div className="flex gap-2 mt-2">
                <button
                  className="bg-red-500 text-white px-2 py-1 rounded"
                  onClick={() => handleResolveComplaint(complaint.id, 'fine')}
                >
                  Fine User
                </button>
                <button
                  className="bg-gray-500 text-white px-2 py-1 rounded"
                  onClick={() => handleResolveComplaint(complaint.id, 'dismiss')}
                >
                  Dismiss Complaint
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Blacklist Section */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Pending Blacklist Requests</h2>
        {blacklistRequests.length === 0 ? (
          <p>No pending blacklist submissions.</p>
        ) : (
          blacklistRequests.map(request => (
            <div key={request.id} className="border p-4 mb-4 flex flex-col">
              <p><strong>Word:</strong> {request.word}</p>
              <div className="flex gap-2 mt-2">
                <button
                  className="bg-green-500 text-white px-2 py-1 rounded"
                  onClick={() => handleBlacklistDecision(request.id, 'approved')}
                >
                  Approve
                </button>
                <button
                  className="bg-red-600 text-white px-2 py-1 rounded"
                  onClick={() => handleBlacklistDecision(request.id, 'rejected')}
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
