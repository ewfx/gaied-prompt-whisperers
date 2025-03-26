import React, { useEffect, useState } from "react";
import { Container, Typography, Card, CardContent, CircularProgress } from "@mui/material";

const App = () => {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:5000/process-emails")
      .then((res) => res.json())
      .then((data) => {
        setEmails(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching emails:", err);
        setLoading(false);
      });
  }, []);

  return (
    <Container>
      <Typography variant="h4" sx={{ mt: 4, mb: 2 }}>Loan Request Classification</Typography>
      {loading ? <CircularProgress /> : (
        emails.map((email, index) => (
          <Card key={index} sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6">{email.subject}</Typography>
              <Typography variant="body1"><strong>Request Type:</strong> {email?.requestType}</Typography>
              {email?.subRequestTypes?.length > 0 && (
                <Typography variant="body2"><strong>Sub-Requests:</strong> {email?.subRequestTypes?.join(", ")}</Typography>
              )}
              <Typography variant="body2"><strong>Confidence Score:</strong> {email?.confidenceScore?.toFixed(2)}</Typography>
              <Typography variant="body2"><strong>Sentiment:</strong> {email?.sentiment}</Typography>
              <Typography variant="body2"><strong>Intent:</strong> {email?.intent}</Typography>
              <Typography variant="body2"><strong>Entities:</strong></Typography>
              <ul>
                {Object.entries(email?.entities).map(([key, value]) => (
                  <li key={key}><strong>{key}:</strong> {value}</li>
                ))}
              </ul>
              <Typography variant="body2"><strong>Spam Status:</strong> {email?.spamStatus}</Typography>
            </CardContent>
          </Card>
        ))
      )}
    </Container>
  );
};

export default App;