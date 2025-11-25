import { AiChat } from "../ai-chat/ai-chat";

export const ChatArea = ({ SENTENCES }) => {
  return (
    <div className="border-2 border-gray-200 rounded-lg overflow-hidden max-h-[50rem] pb-4">
      <AiChat SENTENCES={SENTENCES} />
    </div>
  );
};
