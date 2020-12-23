import { ConnectorUpdate } from '@web3-react/types'
import {
  AbstractConnector,
  FortmaticConnector,
  InjectedConnector,
  WalletConnectConnector
} from './connectors'
import { LocalStorage, Storage } from './storage'
import {
  RequestArguments,
  ProviderType,
  ChainId,
  ConnectionData,
  ConnectionResponse,
  Provider,
  ClosableConnector,
  LegacyProvider
} from './types'
import { getConfiguration } from './configuration'
import './declarations'

export class ConnectionManager {
  connector?: AbstractConnector

  constructor(public storage: Storage) {}

  async connect(
    providerType?: ProviderType,
    chainId: ChainId = ChainId.MAINNET
  ): Promise<ConnectionResponse> {
    if (!providerType) {
      const connectionData = this.getConnectionData()
      if (!connectionData) {
        throw new Error('connect called without a provider and none was stored')
      }
      providerType = connectionData.providerType
      chainId = connectionData.chainId
    }

    this.setConnectionData(providerType, chainId)
    this.connector = this.getConnector(providerType, chainId)

    const {
      provider,
      account
    }: ConnectorUpdate = await this.connector.activate()

    return {
      provider: this.toProvider(provider),
      account: account || '',
      chainId
    }
  }

  getAvailableProviders(): ProviderType[] {
    const available = [ProviderType.FORTMATIC, ProviderType.WALLET_CONNECT]
    if (typeof window !== 'undefined' && window.ethereum !== undefined) {
      available.push(ProviderType.INJECTED)
    }
    return available
  }

  async disconnect() {
    if (this.connector) {
      this.connector.deactivate()

      if (this.isClosableConnector()) {
        await (this.connector as ClosableConnector).close()
      }

      this.storage.clear()
      this.connector = undefined
    }
  }

  async getProvider(): Promise<Provider> {
    if (!this.connector) {
      throw new Error('No valid connector found. Please .connect() first')
    }
    return this.connector.getProvider()
  }

  async createProvider(
    providerType: ProviderType,
    chainId: ChainId = ChainId.MAINNET
  ): Promise<Provider> {
    const connector = this.getConnector(providerType, chainId)
    const provider = await connector.getProvider()
    return this.toProvider(provider)
  }

  getConnector(
    providerType: ProviderType,
    chainId: ChainId
  ): AbstractConnector {
    switch (providerType) {
      case ProviderType.FORTMATIC:
        return new FortmaticConnector(chainId)
      case ProviderType.INJECTED:
        return new InjectedConnector(chainId)
      case ProviderType.WALLET_CONNECT:
        return new WalletConnectConnector(chainId)
      default:
        throw new Error(`Invalid provider ${providerType}`)
    }
  }

  private getConnectionData(): ConnectionData | undefined {
    const { storageKey } = getConfiguration()
    const connectionData = this.storage.get(storageKey)
    return connectionData ? JSON.parse(connectionData) : undefined
  }

  private setConnectionData(providerType: ProviderType, chainId: ChainId) {
    const { storageKey } = getConfiguration()
    const connectionData = JSON.stringify({
      providerType,
      chainId
    } as ConnectionData)
    this.storage.set(storageKey, connectionData)
  }

  private isClosableConnector() {
    return this.connector && typeof this.connector['close'] !== 'undefined'
  }

  private toProvider(provider: LegacyProvider | Provider): Provider {
    const newProvider = provider as Provider

    if (this.isLegacyProvider(provider)) {
      newProvider.request = ({ method, params }: RequestArguments) =>
        (provider as LegacyProvider).send(method, params)
    }

    return newProvider
  }

  private isLegacyProvider(provider: LegacyProvider | Provider): boolean {
    return (
      typeof provider['request'] === 'undefined' &&
      typeof provider['send'] !== 'undefined'
    )
  }
}

export const connection = new ConnectionManager(new LocalStorage())
