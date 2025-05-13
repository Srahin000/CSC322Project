import { FaBars } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import supabase from "../config/supabaseClient";
import { useEffect, useState } from "react";

export default function SidebarMenu({ sidebarOpen, setSidebarOpen }) {
  const navigate = useNavigate();
  const [tokens, setTokens] = useState(null);
  const [role, setRole] = useState(null);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    const fetchTokensAndRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('tokens, role, email')
        .eq('id', session.user.id)
        .single();
      if (!error && data) {
        setTokens(data.tokens);
        setRole(data.role);
        setUserEmail(data.email);
      }
    };
    fetchTokensAndRole();
  }, []);

  const sidebarItems = [
    { label: "My Files", onClick: () => navigate("/my-files") },
    { label: "Purchase Tokens", onClick: () => navigate("/purchase-tokens") },
    { label: "Collaboration Invites", onClick: () => navigate("/collaboration-invites") },
    { label: "Submit Blacklist Word", onClick: () => navigate("/submit-blacklist") },
    { label: "Submit Complaint", onClick: () => navigate("/submit-complaint") },
  ];
  if (role === "super") {
    sidebarItems.push({ label: "Super Dashboard", onClick: () => navigate("/super-dashboard") });
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <>
      {/* Sidebar */}
      <div className={`fixed top-0 left-0 h-screen w-64 z-30 bg-gray-900 text-white transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="font-bold text-lg m-auto">Menu</span>
          <button onClick={() => setSidebarOpen(false)} className="text-white text-2xl">×</button>
        </div>
        {/* User email display */}
        <div className="px-4 py-2 border-b border-gray-700 text-gray-300 text-sm text-center truncate">
          {userEmail || "..."}
        </div>
        {/* Token count display */}
        <div className="px-4 py-3 border-b border-gray-700 text-blue-300 font-semibold text-center">
          Tokens: {tokens !== null ? tokens : "..."}
        </div>
        <nav className="flex flex-col gap-2 p-4 overflow-y-auto h-[calc(100vh-10rem)]">
          {sidebarItems.map((item) => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); setSidebarOpen(false); }}
              className="text-left px-3 py-2 rounded hover:bg-gray-700 transition"
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={() => { handleSignOut(); setSidebarOpen(false); }}
            className="text-left px-3 py-2 rounded hover:bg-red-700 transition text-red-400 hover:text-white mt-4"
          >
            Sign Out
          </button>
        </nav>
      </div>
      {/* Hamburger icon */}
      <button
        className="fixed top-4 left-4 z-40 bg-gray-900 text-white p-2 rounded shadow-lg focus:outline-none"
        onClick={() => setSidebarOpen((open) => !open)}
        aria-label="Open menu"
      >
        <FaBars size={24} />
      </button>
    </>
  );
} 