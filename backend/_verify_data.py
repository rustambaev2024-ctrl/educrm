"""Verify production data integrity via API — Elite Academy."""
import json
import urllib.request
import urllib.error

BASE = "https://educrm-production.up.railway.app/api/v1"

def api(method, path, token=None, schema="elite_academy", data=None):
    url = BASE + path
    headers = {"Content-Type": "application/json", "X-Tenant-Schema": schema}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        b = e.read().decode()
        return {"_error": e.code, "_body": b[:300]}

print("=" * 60)
print("  PRODUCTION DATA INTEGRITY CHECK")
print("=" * 60)

# Health
health = api("GET", "/health/", schema="public")
print(f"\n1. Backend health: {health}")

# Login as director in elite_academy
print("\n2. Login as Elite Academy director...")
login = api("POST", "/auth/token/", schema="elite_academy",
            data={"phone": "+998900000001", "password": "password123"})
if "_error" in login:
    print(f"   FAILED: {login}")
    
    # Try listing institutions via superadmin API (no auth needed for listing)
    print("\n   Trying other approaches...")
    
    # Check if backend is serving the old code (before our change) or new code
    # Test without header
    test = api("POST", "/auth/token/", schema="",
               data={"phone": "+998900000001", "password": "password123"})
    print(f"   Without schema: {test}")
else:
    token = login.get("access")
    print(f"   Token obtained: {token[:30]}...")

    me = api("GET", "/auth/me/", token=token)
    print(f"   User: {me.get('fullName')} | Role: {me.get('role')} | Schema: {me.get('schemaName')}")
    schema = me.get("schemaName", "elite_academy")

    # Students
    students = api("GET", "/students/", token=token, schema=schema)
    if isinstance(students, dict) and "results" in students:
        print(f"\n3. Students: {students['count']} total")
    elif isinstance(students, list):
        print(f"\n3. Students: {len(students)}")
    else:
        print(f"\n3. Students: {students}")

    # Staff
    staff = api("GET", "/staff/", token=token, schema=schema)
    if isinstance(staff, dict) and "results" in staff:
        print(f"4. Staff: {staff['count']} total")
    elif isinstance(staff, list):
        print(f"4. Staff: {len(staff)}")
    else:
        print(f"4. Staff: {staff}")

    # Groups
    groups = api("GET", "/groups/", token=token, schema=schema)
    if isinstance(groups, dict) and "results" in groups:
        print(f"5. Groups: {groups['count']} total")
    elif isinstance(groups, list):
        print(f"5. Groups: {len(groups)}")
    else:
        print(f"5. Groups: {groups}")

    # Payments
    payments = api("GET", "/payments/", token=token, schema=schema)
    if isinstance(payments, dict) and "results" in payments:
        print(f"6. Payments: {payments['count']} total")
    elif isinstance(payments, list):
        print(f"6. Payments: {len(payments)}")
    else:
        print(f"6. Payments: {payments}")

print("\n" + "=" * 60)
print("  CHECK COMPLETE")
print("=" * 60)
