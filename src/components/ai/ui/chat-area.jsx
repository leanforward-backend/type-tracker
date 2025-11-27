import { AiChat } from "../ai-chat/ai-chat";

export const ChatArea = ({ SENTENCES }) => {
  return (
    <div className="w-full mt-4">
      <AiChat SENTENCES={SENTENCES} />
    </div>
  );
};
