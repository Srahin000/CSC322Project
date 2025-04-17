import { useEffect, useState } from 'react';
import supabase from './config/supabaseClient';
import SignIn from './Components/SignIn';
import Register from './Components/Register';
import SignOut from './Components/SignOut';
import TextEditor from './Components/TextCorrectionApp';
import FreeEditor from './Components/FreeTextEditor'; // New Component

export default function App() {
  const [session, setSession] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const [freeMode, setFreeMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (freeMode) {
    return (
      <div className="p-4 max-w-xl mx-auto">
        <FreeEditor onExitFreeMode={() => setFreeMode(false)} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-4 max-w-xl mx-auto">
        {showRegister ? (
          <Register onSwitchToSignIn={() => setShowRegister(false)} />
        ) : (
          <SignIn onSwitchToRegister={() => setShowRegister(true)} />
        )}
        <div className="mt-4 text-center">
          <p>Want to try the app?</p>
          <button
            className="bg-purple-500 text-white px-4 py-2 mt-2"
            onClick={() => setFreeMode(true)}
          >
            Try for Free
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-xl mx-auto">
      <SignOut />
      <TextEditor />
    </div>
  );
}
