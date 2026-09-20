import { MobilePageContainer } from "@/components/layout/mobile-page-container";
import { Card } from "@/components/ui/card";

export default function SuccessPage() {
  return (
    <MobilePageContainer>
      <Card>
        <p className="eyebrow">Success placeholder</p>
        <h1>Your portrait is ready</h1>
        <p className="muted">
          Verified payment and secure download will be implemented later.
        </p>
      </Card>
    </MobilePageContainer>
  );
}
