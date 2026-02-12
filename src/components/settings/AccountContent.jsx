import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { LogIn, Settings as SettingsIcon } from 'lucide-react';
import ClaudeLogo from '../ClaudeLogo';
import CursorLogo from '../CursorLogo';
import CodexLogo from '../CodexLogo';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { authenticatedFetch } from '../../utils/api';

const agentConfig = {
  claude: {
    name: 'Claude',
    description: 'Anthropic Claude AI assistant',
    Logo: ClaudeLogo,
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    borderClass: 'border-blue-200 dark:border-blue-800',
    textClass: 'text-blue-900 dark:text-blue-100',
    subtextClass: 'text-blue-700 dark:text-blue-300',
    buttonClass: 'bg-blue-600 hover:bg-blue-700',
  },
  cursor: {
    name: 'Cursor',
    description: 'Cursor AI-powered code editor',
    Logo: CursorLogo,
    bgClass: 'bg-purple-50 dark:bg-purple-900/20',
    borderClass: 'border-purple-200 dark:border-purple-800',
    textClass: 'text-purple-900 dark:text-purple-100',
    subtextClass: 'text-purple-700 dark:text-purple-300',
    buttonClass: 'bg-purple-600 hover:bg-purple-700',
  },
  codex: {
    name: 'Codex',
    description: 'OpenAI Codex AI assistant',
    Logo: CodexLogo,
    bgClass: 'bg-gray-100 dark:bg-gray-800/50',
    borderClass: 'border-gray-300 dark:border-gray-600',
    textClass: 'text-gray-900 dark:text-gray-100',
    subtextClass: 'text-gray-700 dark:text-gray-300',
    buttonClass: 'bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600',
  },
};

export default function AccountContent({ agent, authStatus, onLogin }) {
  const { t } = useTranslation('settings');
  const config = agentConfig[agent];
  const { Logo } = config;

  // CCR UI configuration state
  const [isCcrExecuting, setIsCcrExecuting] = useState(false);
  const [ccrOutput, setCcrOutput] = useState('');

  const handleCcrUi = async () => {
    setIsCcrExecuting(true);
    setCcrOutput('Launching CCR UI configuration...\n');

    try {
      const response = await authenticatedFetch('/api/system/ccr-ui', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setCcrOutput(prev => prev + data.output + '\n');
        setCcrOutput(prev => prev + '\n✅ ' + (data.message || 'CCR UI launched successfully') + '\n');
      } else {
        setCcrOutput(prev => prev + '\n❌ Failed: ' + (data.error || 'Unknown error') + '\n');
        if (data.errorOutput) {
          setCcrOutput(prev => prev + data.errorOutput + '\n');
        }
      }
    } catch (error) {
      setCcrOutput(prev => prev + '\n❌ Error: ' + error.message + '\n');
    } finally {
      setIsCcrExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <Logo className="w-6 h-6" />
        <div>
          <h3 className="text-lg font-medium text-foreground">{config.name}</h3>
          <p className="text-sm text-muted-foreground">{t(`agents.account.${agent}.description`)}</p>
        </div>
      </div>

      <div className={`${config.bgClass} border ${config.borderClass} rounded-lg p-4`}>
        <div className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className={`font-medium ${config.textClass}`}>
                {t('agents.connectionStatus')}
              </div>
              <div className={`text-sm ${config.subtextClass}`}>
                {authStatus?.loading ? (
                  t('agents.authStatus.checkingAuth')
                ) : authStatus?.authenticated ? (
                  agent === 'claude'
                    ? t('agents.authStatus.installedVersion', { email: authStatus.email || t('agents.authStatus.authenticatedUser') })
                    : t('agents.authStatus.loggedInAs', { email: authStatus.email || t('agents.authStatus.authenticatedUser') })
                ) : (
                  agent === 'claude' ? t('agents.authStatus.notInstalled') : t('agents.authStatus.notConnected')
                )}
              </div>
            </div>
            <div>
              {authStatus?.loading ? (
                <Badge variant="secondary" className="bg-gray-100 dark:bg-gray-800">
                  {t('agents.authStatus.checking')}
                </Badge>
              ) : authStatus?.authenticated ? (
                <Badge variant="success" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  {agent === 'claude' ? t('agents.authStatus.installed') : t('agents.authStatus.connected')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                  {agent === 'claude' ? t('agents.authStatus.notInstalled') : t('agents.authStatus.disconnected')}
                </Badge>
              )}
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className={`font-medium ${config.textClass}`}>
                  {authStatus?.authenticated ? t('agents.login.reAuthenticate') : t('agents.login.title')}
                </div>
                <div className={`text-sm ${config.subtextClass}`}>
                  {authStatus?.authenticated
                    ? t('agents.login.reAuthDescription')
                    : t('agents.login.description', { agent: config.name })}
                </div>
              </div>
              <Button
                onClick={onLogin}
                className={`${config.buttonClass} text-white`}
                size="sm"
              >
                <LogIn className="w-4 h-4 mr-2" />
                {authStatus?.authenticated ? t('agents.login.reLoginButton') : t('agents.login.button')}
              </Button>
            </div>
          </div>

          {authStatus?.error && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="text-sm text-red-600 dark:text-red-400">
                {t('agents.error', { error: authStatus.error })}
              </div>
            </div>
          )}

          {/* CCR Configuration - Only for Claude */}
          {agent === 'claude' && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-medium ${config.textClass}`}>
                    CCR Configuration
                  </div>
                  <div className={`text-sm ${config.subtextClass}`}>
                    Launch CCR UI configuration interface
                  </div>
                </div>
                <Button
                  onClick={handleCcrUi}
                  disabled={isCcrExecuting}
                  className={`${config.buttonClass} text-white`}
                  size="sm"
                >
                  {isCcrExecuting ? (
                    <>
                      <div className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Running...
                    </>
                  ) : (
                    <>
                      <SettingsIcon className="w-4 h-4 mr-2" />
                      Configure CCR
                    </>
                  )}
                </Button>
              </div>

              {/* CCR Output */}
              {ccrOutput && (
                <div className="mt-4">
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 border border-gray-700 max-h-48 overflow-y-auto">
                    <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{ccrOutput}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
