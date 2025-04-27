import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom"; // assuming you're using react-router
import supabase from "../config/supabaseClient";

export default function MyFiles() {
  const [files, setFiles] = useState([]);
  const navigate = useNavigate();
  useEffect(() => {
    const fetchFiles = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          return;
        }
      
        // Fetch owned files
        const { data: ownedFiles, error: ownedError } = await supabase
          .from('texts')
          .select('id, title, created_at')
          .eq('user_id', session.user.id);
      
        // Fetch collaborations
        const { data: collaborationEntries, error: collabError } = await supabase
          .from('text_collaborators')
          .select('text_id')
          .eq('user_id', session.user.id);
      
        let collaboratorFiles = [];
      
        if (collaborationEntries?.length) {
          const textIds = collaborationEntries.map(entry => entry.text_id);
      
          const { data: texts, error: textError } = await supabase
            .from('texts')
            .select('id, title, created_at')
            .in('id', textIds);
      
          collaboratorFiles = texts || [];
        }
      
        if (ownedError || collabError) {
          console.error(ownedError || collabError);
        } else {
          setFiles([...ownedFiles, ...collaboratorFiles]);
        }
      };
    

    fetchFiles();
  }, []);
  
  const handleAddCollaborator = async (textId) => {
    const email = prompt("Enter the collaborator's email:");
  
    if (!email) return;
  
    // 1. Find user by email
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', email) // Case-insensitive match
      .single();
  
    if (userError || !user) {
      alert("User not found!");
      return;
    }
  
    // 2. Insert into text_collaborators
    const { error: collabError } = await supabase
      .from('text_collaborators')
      .insert([{ text_id: textId, user_id: user.id }]);
  
    if (collabError) {
      console.error(collabError);
      alert("Failed to add collaborator.");
    } else {
      alert("Collaborator added successfully!");
    }
  };
  
  

  const handleOpenFile = (id) => {
    navigate(`/editor/${id}`); // go to text editor for that file
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
        <button
        className="bg-blue-500 text-white px-4 py-2 my-4"
        onClick={() => navigate("/editor")}
        >
        ➕ New File
        </button>
      <h1 className="text-xl font-bold mb-4">My Files</h1>
      {files.map(file => (
        <div key={file.id} className="border p-2 mb-2 flex justify-between">
          <div>
            <p className="font-semibold">{file.title}</p>
            <p className="text-sm text-gray-500">{new Date(file.created_at).toLocaleString()}</p>
          </div>
          <div>
          <button
            className="bg-blue-500 text-white px-2 py-1"
            onClick={() => handleOpenFile(file.id)}
          >
            Open
          </button>
          <button
            className="bg-green-500 text-white px-2 py-1"
            onClick={() => handleAddCollaborator(file.id)}
            >
            Add Collaborator
            </button>
            </div>
        </div>
      ))}
    </div>
  );
}
