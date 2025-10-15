import os
import json
import streamlit as st
import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore

def init_firebase():
    if firebase_admin._apps:
        return
    svc = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "")
    if not svc:
        # rely on default credentials if available
        try:
            firebase_admin.initialize_app()
            return
        except Exception as e:
            st.error("No FIREBASE_SERVICE_ACCOUNT set and default credentials not available.")
            raise
    try:
        cred_json = json.loads(svc) if svc.strip().startswith("{") else json.loads(
            bytes(svc, "utf-8").decode("utf-8") if isinstance(svc, bytes) else json.loads(svc)
        )
    except Exception:
        # try base64 decode
        try:
            import base64
            cred_json = json.loads(base64.b64decode(svc).decode("utf-8"))
        except Exception as e:
            st.error("Failed to parse FIREBASE_SERVICE_ACCOUNT.")
            raise
    cred = credentials.Certificate(cred_json)
    firebase_admin.initialize_app(cred)

@st.cache_data(ttl=60)
def load_sms(limit=200):
    init_firebase()
    db = firestore.client()
    docs = db.collection("sms").order_by("receivedAt", direction=firestore.Query.DESCENDING).limit(limit).stream()
    rows = []
    for d in docs:
        data = d.to_dict()
        data["id"] = d.id
        rows.append(data)
    if not rows:
        return pd.DataFrame()
    # Flatten parsed if exists
    df = pd.json_normalize(rows)
    # reorder common columns
    cols = [c for c in ["id","from","to","text","parsed.amount","parsed.payee","parsed.date_extracted","receivedAt"] if c in df.columns]
    cols += [c for c in df.columns if c not in cols]
    return df[cols]

st.set_page_config(page_title="Tracker Dashboard", layout="wide")
st.title("Tracker — SMS Dashboard")

col1, col2 = st.columns([3,1])
with col2:
    limit = st.number_input("Rows", min_value=10, max_value=500, value=100, step=10)
    if st.button("Refresh"):
        load_sms.clear()

df = load_sms(limit=int(limit))
if df.empty:
    st.info("No SMS records found.")
else:
    st.dataframe(df, use_container_width=True)
    csv = df.to_csv(index=False)
    st.download_button("Download CSV", data=csv, file_name="sms.csv")