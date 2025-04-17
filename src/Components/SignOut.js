import supabase from '../config/supabaseClient';

export default function SignOut() {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload(); // Refresh after logout
  };

  return (
    <div className="text-right p-2">
      <button
        onClick={handleSignOut}
        className="bg-red-500 text-white px-4 py-2"
      >
        Sign Out
      </button>
    </div>
  );
}
