import { useQuery } from "convex/react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

export default function Stats({ history, problemKeys, problemWords }) {
  if (history.length === 0) {
    return (
      <div className="card">
        <h2 className="title" style={{ fontSize: "2rem" }}>
          Statistics
        </h2>
        <p style={{ color: "var(--text-secondary)" }}>
          No games played yet. Start typing to track your progress!
        </p>
      </div>
    );
  }

  const averageWpm = Math.round(
    history.reduce((acc, curr) => acc + curr.wpm, 0) / history.length
  );

  const averageAccuracy = Math.round(
    history.reduce((acc, curr) => acc + curr.accuracy, 0) / history.length
  );

  const storedQuotes = useQuery(api.storedQuotes.getStoredQuotes);

  const [historyPage, setHistoryPage] = useState(1);
  const [quotesPage, setQuotesPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const totalHistoryPages = Math.ceil(history.length / ITEMS_PER_PAGE);
  const paginatedHistory = history.slice(
    (historyPage - 1) * ITEMS_PER_PAGE,
    historyPage * ITEMS_PER_PAGE
  );

  const totalQuotesPages = Math.ceil(
    (storedQuotes?.length || 0) / ITEMS_PER_PAGE
  );
  const paginatedQuotes = storedQuotes?.slice(
    (quotesPage - 1) * ITEMS_PER_PAGE,
    quotesPage * ITEMS_PER_PAGE
  );

  return (
    <div className="container" style={{ padding: 0 }}>
      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-value">{averageWpm}</div>
          <div className="stat-label">Avg WPM</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{averageAccuracy}%</div>
          <div className="stat-label">Avg Accuracy</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{history.length}</div>
          <div className="stat-label">Games Played</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Problem Keys</h3>
          <div className="problem-keys">
            {problemKeys.length > 0 ? (
              problemKeys.map(([key, count]) => (
                <div key={key} className="key-badge" title={`${count} errors`}>
                  {key === " " ? "Space" : key}{" "}
                  <span style={{ opacity: 0.7, fontSize: "0.8em" }}>
                    x{count}
                  </span>
                </div>
              ))
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                No errors yet!
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Problem Words</h3>
          <ul style={{ listStyle: "none", padding: 0, textAlign: "left" }}>
            {problemWords.length > 0 ? (
              problemWords.map(([word, count]) => (
                <li
                  key={word}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--bg-input)",
                  }}
                >
                  <span>{word}</span>
                  <span style={{ color: "var(--color-error)" }}>{count}</span>
                </li>
              ))
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                No missed words!
              </p>
            )}
          </ul>
        </div>
      </div>

      <div className="card" style={{ marginTop: "2rem" }}>
        <h3 style={{ marginTop: 0, textAlign: "left" }}>Recent History</h3>
        <Table className="text-base">
          <TableHeader>
            <TableRow className="border-b-[var(--bg-input)] hover:bg-transparent">
              <TableHead className="text-left text-[var(--text-secondary)]">
                WPM
              </TableHead>
              <TableHead className="text-left text-[var(--text-secondary)]">
                Accuracy
              </TableHead>
              <TableHead className="text-right text-[var(--text-secondary)]">
                Date
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedHistory.map((session) => (
              <TableRow
                key={session._id || session.id}
                className="border-b-[var(--bg-input)] hover:bg-transparent"
              >
                <TableCell className="font-bold text-[var(--text-primary)] py-4">
                  {session.wpm} WPM
                </TableCell>
                <TableCell className="py-4">
                  <span
                    style={{
                      color:
                        session.accuracy >= 90
                          ? "var(--color-success)"
                          : "var(--color-warning)",
                    }}
                  >
                    {session.accuracy}% Acc
                  </span>
                </TableCell>
                <TableCell className="text-right text-[var(--text-muted)] py-4">
                  {session.date
                    ? format(new Date(session.date), "MMM d, HH:mm")
                    : session._creationTime
                      ? format(new Date(session._creationTime), "MMM d, HH:mm")
                      : "Recent"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {totalHistoryPages > 1 && (
          <div className="flex items-center justify-end space-x-2 py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              disabled={historyPage === 1}
              className="bg-[var(--bg-input)] text-[var(--text-primary)] border-transparent hover:border-[var(--accent-primary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="text-sm text-[var(--text-secondary)]">
              Page {historyPage} of {totalHistoryPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))
              }
              disabled={historyPage === totalHistoryPages}
              className="bg-[var(--bg-input)] text-[var(--text-primary)] border-transparent hover:border-[var(--accent-primary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <Accordion type="single" collapsible className="card mt-8 w-full">
        <AccordionItem value="product-info">
          <AccordionTrigger>Product Information</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4 text-balance">
            <div className="mt-6">
              <h3 style={{ marginTop: 0, textAlign: "left" }}>Stored Quotes</h3>
              <div className="history-list">
                {paginatedQuotes?.map((quote) => (
                  <div
                    key={quote._id || quote._creationTime}
                    className="history-item"
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: "",
                          color: "var(--text-primary)",
                        }}
                      >
                        {quote.quote}
                      </span>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {quote.date
                          ? format(new Date(quote.date), "MMM d, HH:mm")
                          : quote._creationTime
                            ? format(
                                new Date(quote._creationTime),
                                "MMM d, HH:mm"
                              )
                            : "Recent"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {totalQuotesPages > 1 && (
                <div className="flex items-center justify-end space-x-2 py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuotesPage((p) => Math.max(1, p - 1))}
                    disabled={quotesPage === 1}
                    className="bg-[var(--bg-input)] text-[var(--text-primary)] border-transparent hover:border-[var(--accent-primary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Page {quotesPage} of {totalQuotesPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setQuotesPage((p) => Math.min(totalQuotesPages, p + 1))
                    }
                    disabled={quotesPage === totalQuotesPages}
                    className="bg-[var(--bg-input)] text-[var(--text-primary)] border-transparent hover:border-[var(--accent-primary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
