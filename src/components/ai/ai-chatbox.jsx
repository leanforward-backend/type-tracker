import { ChatArea } from "./ui/chat-area";

export const AiChatbox = ({ SENTENCES }) => {
  // console.log(SENTENCES);
  return (
    <div>
      <ChatArea SENTENCES={SENTENCES} />
    </div>
  );
};
