import { useState, useEffect } from "react";
import supabase from "../config/supabaseClient";
import axios from "axios";
import SidebarMenu from "../Components/SidebarMenu";

export default function PurchaseTokens() {
  const [tokens, setTokens] = useState(null);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("No active session");
        return;
      }
      setUserId(session.user.id);
      const { data, error } = await supabase
        .from('profiles')
        .select('tokens')
        .eq('id', session.user.id)
        .single();
      if (error) {
        setError("Failed to load user tokens.");
      } else {
        setTokens(data.tokens);
      }
    };
    fetchUserData();
  }, []);

  const handlePurchaseTokens = async (amount) => {
    try {
      const response = await axios.post("http://localhost:5000/purchase-tokens", {
        username: userId,
        tokensToAdd: amount,
      });
      setTokens(response.data.tokens);
      setError(null);
      alert(`Successfully purchased ${amount} tokens!`);
    } catch (err) {
      setError(err.response?.data?.error || "Purchase failed");
    }
  };

  return (
    <div className="relative flex h-screen w-screen bg-blue-50">
      <SidebarMenu sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="flex-1 p-6 transition-all duration-200 w-full">
        <div className="bg-white rounded-xl shadow p-8 w-full h-full">
          <h1 className="text-2xl font-extrabold mb-8 text-blue-800">Purchase Tokens</h1>
          <p className="mb-4 text-lg text-blue-900 font-medium">Available Tokens: {tokens !== null ? tokens : "Loading..."}</p>
          {error && <p className="text-red-500 mb-2">{error}</p>}
          <div className="flex flex-wrap gap-4 mt-4">
            {[10, 50, 100].map((amount) => (
              <button
                key={amount}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg text-lg font-semibold shadow hover:bg-blue-700 transition"
                onClick={() => handlePurchaseTokens(amount)}
              >
                Buy {amount} Tokens
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 