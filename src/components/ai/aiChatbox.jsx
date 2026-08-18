import { ChatArea } from "./ui/chat-area";

export const AiChatbox = ({ SENTENCES, category }) => {
  return (
    <div>
      <ChatArea SENTENCES={SENTENCES} category={category} />
    </div>
  );
};
