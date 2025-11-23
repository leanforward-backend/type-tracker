import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SendHorizontal } from "lucide-react";
import { AiChat } from "../ai-chat/ai-chat";

export const ChatArea = ({ SENTENCES }) => {
  return (
    <div className="border-2 border-gray-200 rounded-lg">
      <AiChat SENTENCES={SENTENCES} />
      <div
        style={{
          position: "relative",
          width: "60%",
          margin: "0 auto",
          marginTop: "2rem",
        }}
      >
        <Input
          placeholder="Ask me anything..."
          style={{
            paddingRight: "5px",
            height: "50px",
            borderRadius: "15px",
          }}
          size="xl"
        />
        <Button
          size="icon"
          className="circle-icon-button"
          style={{
            position: "absolute",
            right: "10px",
            top: "50%",
            transform: "translateY(-50%)",
            height: "32px",
            width: "32px",
          }}
        >
          <SendHorizontal />
        </Button>
      </div>
    </div>
  );
};
