import type { Metadata } from "next";
import { ResetLocalClient } from "./reset-local-client";

export const metadata: Metadata = {
  title: "Reset Local State",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ResetLocalPage() {
  return <ResetLocalClient />;
}
