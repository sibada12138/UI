import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    query_spike: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: 100 },
        { duration: "30s", target: 300 },
        { duration: "30s", target: 500 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<800"],
  },
};

const API_BASE = __ENV.API_BASE || "http://127.0.0.1:3001/api";

export default function () {
  const captchaRes = http.post(`${API_BASE}/public/captcha/create`);
  check(captchaRes, { "captcha status 201": (r) => r.status === 201 });

  if (captchaRes.status !== 201) {
    sleep(0.2);
    return;
  }

  const captchaId = captchaRes.json("captchaId");
  const payload = JSON.stringify({
    queryType: "token",
    queryValue: "tk_non_exists",
    captchaId,
    captchaCode: "ABCD",
  });

  const queryRes = http.post(`${API_BASE}/public/query`, payload, {
    headers: { "Content-Type": "application/json" },
  });

  check(queryRes, {
    "query handled": (r) => [200, 400, 403, 404].includes(r.status),
  });
  sleep(0.1);
}

