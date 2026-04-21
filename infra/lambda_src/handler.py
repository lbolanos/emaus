import json
import os
import urllib.error
import urllib.request

import boto3

lightsail = boto3.client("lightsail")


def lambda_handler(event, context):
    action = event.get("action")
    instance_name = os.environ["INSTANCE_NAME"]
    check_url = os.environ.get("RETREAT_CHECK_URL")

    if action == "stop" and check_url:
        try:
            req = urllib.request.Request(check_url, headers={"User-Agent": "emaus-ec2-scheduler"})
            with urllib.request.urlopen(req, timeout=5) as r:
                data = json.loads(r.read())
            if data.get("active"):
                print(f"Retreat active: {json.dumps(data)}. Skipping stop.")
                return {"status": "skipped", "reason": "retreat_active", "retreats": data.get("retreats", [])}
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError) as e:
            print(f"WARN: retreat check failed ({e!r}). Skipping stop for safety.")
            return {"status": "skipped", "reason": "check_failed", "error": repr(e)}

    if action == "stop":
        lightsail.stop_instance(instanceName=instance_name)
    elif action == "start":
        lightsail.start_instance(instanceName=instance_name)
    else:
        return {"status": "error", "reason": "unknown_action", "action": action}

    return {"status": "ok", "action": action, "instance": instance_name}
