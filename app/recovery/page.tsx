'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { 
  checkSessionStatus, 
  recoverSession, 
  getSessionBackupData, 
  getSessionChatlogData,
  auditAllSessions,
  debugSessionInAudit,
  listAllBackupSessionIds,
  RecoveryStatus,
  ChatBackupEntry,
  ChatlogEntry,
  AuditSummary,
  AuditResult
} from './services/recovery-service';
import { format, parseISO } from 'date-fns';

interface RecoveryResult {
  success: boolean;
  recoveredCount?: number;
  error?: string;
}

export default function RecoveryPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [backupData, setBackupData] = useState<ChatBackupEntry[]>([]);
  const [chatlogData, setChatlogData] = useState<ChatlogEntry[]>([]);
  const [recoveryResult, setRecoveryResult] = useState<RecoveryResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [auditResults, setAuditResults] = useState<AuditSummary | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearchTerm, setAuditSearchTerm] = useState('');
  const [backupSessionIds, setBackupSessionIds] = useState<Array<{sessionId: string, latestTimestamp: string, count: number}>>([]);
  const [showBackupIds, setShowBackupIds] = useState(false);
  const [backupIdsLoading, setBackupIdsLoading] = useState(false);
  const [backupSearchTerm, setBackupSearchTerm] = useState('');

  const handleCheckSession = async () => {
    if (!sessionId.trim()) {
      alert('Please enter a session ID');
      return;
    }

    setLoading(true);
    setStatus(null);
    setBackupData([]);
    setChatlogData([]);
    setRecoveryResult(null);
    setShowDetails(false);

    try {
      // Check session status
      const statusResult = await checkSessionStatus(sessionId.trim());
      
      if (!statusResult.success) {
        alert(`Error: ${statusResult.error}`);
        return;
      }

      if (!statusResult.data) {
        alert('No status data returned');
        return;
      }

      setStatus(statusResult.data);

      // If session exists in backup, get the backup data
      if (statusResult.data.existsInBackup) {
        const backupResult = await getSessionBackupData(sessionId.trim());
        if (backupResult.success && backupResult.data) {
          setBackupData(backupResult.data);
        }
      }

      // If session exists in chatlog, get the chatlog data
      if (statusResult.data.existsInChatlog) {
        const chatlogResult = await getSessionChatlogData(sessionId.trim());
        if (chatlogResult.success && chatlogResult.data) {
          setChatlogData(chatlogResult.data);
        }
      }

    } catch (error) {
      console.error('Error checking session:', error);
      alert('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverSession = async () => {
    if (!status || !status.needsRecovery) {
      alert('This session does not need recovery');
      return;
    }

          setLoading(true);
      setRecoveryResult(null);

      try {
        const result = await recoverSession(sessionId.trim(), user?.id);
      
      setRecoveryResult({
        success: result.success,
        recoveredCount: result.data?.recoveredCount,
        error: result.error
      });

      // If recovery was successful, refresh the status
      if (result.success) {
        const updatedStatus = await checkSessionStatus(sessionId.trim());
        if (updatedStatus.success && updatedStatus.data) {
          setStatus(updatedStatus.data);
          
          // Also refresh chatlog data
          const chatlogResult = await getSessionChatlogData(sessionId.trim());
          if (chatlogResult.success && chatlogResult.data) {
            setChatlogData(chatlogResult.data);
          }
        }
      }

    } catch (error) {
      console.error('Error recovering session:', error);
      setRecoveryResult({
        success: false,
        error: 'An unexpected error occurred during recovery'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAuditSessions = async () => {
    setAuditLoading(true);
    setAuditResults(null);

    try {
      const result = await auditAllSessions();
      
      if (!result.success) {
        alert(`Audit failed: ${result.error}`);
        return;
      }

      setAuditResults(result.data || null);

    } catch (error) {
      console.error('Error during audit:', error);
      alert('An unexpected error occurred during audit');
    } finally {
      setAuditLoading(false);
    }
  };

  const handleListBackupSessionIds = async () => {
    setBackupIdsLoading(true);
    setBackupSessionIds([]);

    try {
      const result = await listAllBackupSessionIds();
      
      if (!result.success) {
        alert(`Failed to get backup session IDs: ${result.error}`);
        return;
      }

      setBackupSessionIds(result.data || []);
      setShowBackupIds(true);

    } catch (error) {
      console.error('Error getting backup session IDs:', error);
      alert('An unexpected error occurred');
    } finally {
      setBackupIdsLoading(false);
    }
  };

  const getStatusColor = (status: RecoveryStatus) => {
    if (status.needsRecovery) return 'bg-yellow-500';
    if (status.existsInChatlog && status.existsInBackup) return 'bg-green-500';
    if (status.existsInChatlog) return 'bg-blue-500';
    return 'bg-red-500';
  };

  const getStatusText = (status: RecoveryStatus) => {
    if (status.needsRecovery) return 'Needs Recovery';
    if (status.existsInChatlog && status.existsInBackup) return 'Complete';
    if (status.existsInChatlog) return 'In Chatlog Only';
    if (status.existsInBackup) return 'In Backup Only';
    return 'Not Found';
  };

  return (
    <div className="container mx-auto p-4 pt-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Session Recovery</h1>
        <p className="text-gray-600">
          Recover chat sessions from backup table when they&apos;re missing from the main chatlog
        </p>
      </div>

      {/* Session ID Input */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Session ID Lookup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sessionId">Session ID</Label>
            <div className="flex gap-2">
              <Input
                id="sessionId"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="Enter session ID to check"
                className="flex-1"
                disabled={loading}
              />
              <Button 
                onClick={handleCheckSession}
                disabled={loading || !sessionId.trim()}
              >
                {loading ? 'Checking...' : 'Check Session'}
              </Button>
              <Button 
                onClick={() => {
                  if (sessionId.trim()) {
                    debugSessionInAudit(sessionId.trim()).then(result => {
                      console.log('Debug result:', result);
                      alert('Debug complete - check browser console for detailed logs');
                    });
                  }
                }}
                disabled={loading || !sessionId.trim()}
                variant="outline"
                className="text-xs"
              >
                Debug
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Display */}
      {status && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Session Status
              <Badge className={`text-white ${getStatusColor(status)}`}>
                {getStatusText(status)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-900">Chatlog Table</h4>
                <div className="flex items-center gap-2">
                  <Badge variant={status.existsInChatlog ? "default" : "secondary"}>
                    {status.existsInChatlog ? "Found" : "Not Found"}
                  </Badge>
                  {status.existsInChatlog && (
                    <span className="text-sm text-gray-600">
                      {status.chatlogCount} messages
                    </span>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-900">Backup Table</h4>
                <div className="flex items-center gap-2">
                  <Badge variant={status.existsInBackup ? "default" : "secondary"}>
                    {status.existsInBackup ? "Found" : "Not Found"}
                  </Badge>
                  {status.existsInBackup && (
                    <span className="text-sm text-gray-600">
                      {status.backupCount} messages
                    </span>
                  )}
                </div>
              </div>
            </div>

            {status.needsRecovery && (
              <div className="pt-4 border-t">
                <Alert className="mb-4">
                  <div className="text-amber-600">
                    This session exists in backup but not in chatlog. It can be recovered.
                  </div>
                </Alert>
                <Button 
                  onClick={handleRecoverSession}
                  disabled={loading}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  {loading ? 'Recovering...' : 'Recover Session'}
                </Button>
              </div>
            )}

            {status.existsInBackup || status.existsInChatlog ? (
              <Button
                variant="outline"
                onClick={() => setShowDetails(!showDetails)}
                className="mt-4"
              >
                {showDetails ? 'Hide Details' : 'Show Message Details'}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Recovery Result */}
      {recoveryResult && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Recovery Result</CardTitle>
          </CardHeader>
          <CardContent>
            {recoveryResult.success ? (
              <Alert className="bg-green-50 border-green-200">
                <div className="text-green-800">
                  ✅ Session recovered successfully! {recoveryResult.recoveredCount} messages were transferred to the chatlog.
                </div>
              </Alert>
            ) : (
              <Alert className="bg-red-50 border-red-200">
                <div className="text-red-800">
                  ❌ Recovery failed: {recoveryResult.error}
                </div>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Message Details */}
      {showDetails && (status?.existsInBackup || status?.existsInChatlog) && (
        <div className="space-y-6">
          {/* Backup Data */}
          {backupData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Backup Table Data ({backupData.length} messages)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {backupData.map((entry, index) => (
                    <div key={entry.id} className="border-l-4 border-yellow-400 bg-yellow-50 p-3 rounded">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">Message {index + 1}</Badge>
                        <span className="text-xs text-gray-500">
                          {format(parseISO(entry.original_timestamp), 'MMM dd, yyyy HH:mm:ss')}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="bg-white p-2 rounded border-l-2 border-gray-300">
                          <div className="text-xs text-gray-600 font-medium mb-1">AI Response</div>
                          <div className="text-sm">{entry.llm_message}</div>
                        </div>
                        <div className="bg-blue-50 p-2 rounded border-l-2 border-blue-300">
                          <div className="text-xs text-blue-600 font-medium mb-1">User Message</div>
                          <div className="text-sm">{entry.human_message}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Chatlog Data */}
          {chatlogData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Chatlog Table Data ({chatlogData.length} messages)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {chatlogData.map((entry, index) => (
                    <div key={entry.id} className="border-l-4 border-green-400 bg-green-50 p-3 rounded">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">Message {index + 1}</Badge>
                        <span className="text-xs text-gray-500">
                          {format(parseISO(entry.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="bg-white p-2 rounded border-l-2 border-gray-300">
                          <div className="text-xs text-gray-600 font-medium mb-1">AI Response</div>
                          <div className="text-sm">{entry.llm_message}</div>
                        </div>
                        <div className="bg-blue-50 p-2 rounded border-l-2 border-blue-300">
                          <div className="text-xs text-blue-600 font-medium mb-1">User Message</div>
                          <div className="text-sm">{entry.human_message}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Backup Session IDs List */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Backup Session IDs
            <Button 
              onClick={handleListBackupSessionIds}
              disabled={backupIdsLoading}
              variant="outline"
            >
              {backupIdsLoading ? 'Loading...' : 'List All Backup Session IDs'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            Simple list of all unique session IDs found in the backup table.
          </p>
          
          {showBackupIds && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Found {backupSessionIds.length} unique session IDs
                  {backupSearchTerm && (
                    <span className="text-gray-500 ml-2">
                      (showing {backupSessionIds.filter(item => 
                        item.sessionId.toLowerCase().includes(backupSearchTerm.toLowerCase())
                      ).length} filtered)
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search session ID..."
                    value={backupSearchTerm}
                    onChange={(e) => setBackupSearchTerm(e.target.value)}
                    className="w-48 h-8 text-xs"
                  />
                  {backupSearchTerm && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBackupSearchTerm('')}
                      className="h-8 px-2"
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowBackupIds(false)}
                  >
                    Hide List
                  </Button>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                <div className="grid gap-2">
                  {backupSessionIds
                    .filter(item => 
                      !backupSearchTerm || 
                      item.sessionId.toLowerCase().includes(backupSearchTerm.toLowerCase())
                    )
                    .map((item, index) => (
                    <div 
                      key={item.sessionId} 
                      className="flex items-center justify-between p-2 bg-white rounded border hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <span className="font-mono text-sm">{item.sessionId}</span>
                        <div className="text-xs text-gray-500 mt-1">
                          Latest: {format(parseISO(item.latestTimestamp), 'MMM dd, yyyy HH:mm')} • {item.count} messages
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">#{index + 1}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSessionId(item.sessionId);
                            handleCheckSession();
                          }}
                          className="text-xs h-6"
                        >
                          Check
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Session Audit
            <Button 
              onClick={handleAuditSessions}
              disabled={auditLoading}
              variant="outline"
            >
              {auditLoading ? 'Auditing...' : 'Run Audit'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            Check all sessions in backup table against chatlog to identify missing sessions.
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
            <p className="text-xs text-yellow-800">
              <strong>Note:</strong> Audit is limited to 50,000 rows per table. If you have more entries, 
              some sessions may not appear in audit results. Check browser console for warnings.
            </p>
          </div>
          
          {auditResults && (
            <div className="space-y-6">
              {/* Truncation Warning */}
              {auditResults.possiblyTruncated && (
                <Alert className="bg-red-50 border-red-200">
                  <div className="text-red-800">
                    ⚠️ <strong>Data Truncation Detected!</strong> The audit returned {auditResults.backupRowsReturned} backup rows 
                    and {auditResults.chatlogRowsReturned} chatlog rows. Some sessions may be missing from results due to the 50,000 row limit.
                    Consider contacting an admin for a more comprehensive audit.
                  </div>
                </Alert>
              )}
              
              {/* Audit Summary */}
              <div className="grid md:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-blue-600">{auditResults.totalBackupSessions}</div>
                    <p className="text-xs text-gray-500">Backup Sessions</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-green-600">{auditResults.sessionsComplete}</div>
                    <p className="text-xs text-gray-500">Complete Sessions</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-500">
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-red-600">{auditResults.sessionsNeedingRecovery}</div>
                    <p className="text-xs text-gray-500">Need Recovery</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-purple-500">
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-purple-600">{auditResults.totalChatlogSessions}</div>
                    <p className="text-xs text-gray-500">Total Chatlog Sessions</p>
                  </CardContent>
                </Card>
              </div>

              {/* Missing Sessions */}
              {auditResults.missingFromChatlog.length > 0 && (
                <Card className="border-l-4 border-l-red-500">
                  <CardHeader>
                    <CardTitle className="text-red-700">
                      Sessions Missing from Chatlog ({auditResults.missingFromChatlog.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {auditResults.missingFromChatlog.map((session) => (
                        <div key={session.sessionId} className="bg-red-50 p-4 rounded-lg border border-red-200">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <Badge variant="destructive">Missing</Badge>
                              <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                                {session.sessionId}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSessionId(session.sessionId);
                                handleCheckSession();
                              }}
                              className="text-xs"
                            >
                              Check & Recover
                            </Button>
                          </div>
                          <div className="grid md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Backup Messages:</span>
                              <span className="ml-2 font-medium">{session.backupCount}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">User IDs:</span>
                              <span className="ml-2 font-mono text-xs">{session.userIds.join(', ')}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">First Message:</span>
                              <span className="ml-2 text-xs">{format(parseISO(session.firstBackupTimestamp), 'MMM dd, HH:mm')}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Last Message:</span>
                              <span className="ml-2 text-xs">{format(parseISO(session.lastBackupTimestamp), 'MMM dd, HH:mm')}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* All Sessions Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    All Backup Sessions Summary
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Search session ID..."
                        value={auditSearchTerm}
                        onChange={(e) => setAuditSearchTerm(e.target.value)}
                        className="w-48 h-8 text-xs"
                      />
                      {auditSearchTerm && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAuditSearchTerm('')}
                          className="h-8 px-2"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {auditSearchTerm && (
                    <p className="text-xs text-gray-500 mb-2">
                      Showing {auditResults.allSessions.filter(session => 
                        session.sessionId.toLowerCase().includes(auditSearchTerm.toLowerCase())
                      ).length} of {auditResults.allSessions.length} sessions
                    </p>
                  )}
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {auditResults.allSessions
                      .filter(session => 
                        !auditSearchTerm || 
                        session.sessionId.toLowerCase().includes(auditSearchTerm.toLowerCase())
                      )
                      .map((session) => (
                      <div 
                        key={session.sessionId} 
                        className={`flex items-center justify-between p-2 rounded border ${
                          session.needsRecovery 
                            ? 'border-red-200 bg-red-50' 
                            : 'border-green-200 bg-green-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant={session.needsRecovery ? "destructive" : "default"}>
                            {session.needsRecovery ? "Missing" : "Complete"}
                          </Badge>
                          <span className="font-mono text-xs bg-white px-2 py-1 rounded">
                            {session.sessionId}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          <span>Backup: {session.backupCount}</span>
                          <span>Chatlog: {session.chatlogCount}</span>
                          <span>{format(parseISO(session.firstBackupTimestamp), 'MMM dd')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>How Session Recovery & Audit Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Session Recovery:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Checks if a session exists in both chatlog and chat_backup tables</li>
                <li>• Identifies sessions that need recovery (in backup but not chatlog)</li>
                <li>• Safely transfers backup data to the main chatlog table</li>
                <li>• Preserves original timestamps and user associations</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Session Audit:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Scans all sessions in backup table for completeness</li>
                <li>• Cross-references with chatlog to find missing sessions</li>
                <li>• Provides comprehensive overview of data integrity</li>
                <li>• Read-only operation - no database modifications</li>
              </ul>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Safety features:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• User ID verification ensures secure recovery</li>
                <li>• Prevents duplicate recovery of existing sessions</li>
                <li>• Validates data integrity before transfer</li>
                <li>• Provides detailed status and error reporting</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Audit features:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• One-click recovery buttons for missing sessions</li>
                <li>• Detailed metadata including timestamps and user IDs</li>
                <li>• Summary statistics for quick overview</li>
                <li>• Scrollable lists for handling large datasets</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 