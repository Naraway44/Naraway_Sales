import Razorpay from "razorpay";
import { env } from "@/common/env";

export const razorpay = new Razorpay({
  key_id: env.razorpayKeyId,
  key_secret: env.razorpayKeySecret,
});
