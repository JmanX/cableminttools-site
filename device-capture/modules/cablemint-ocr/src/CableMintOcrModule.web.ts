import { registerWebModule, NativeModule } from 'expo';

// CableMintOcrModule is not available on the web platform.
class CableMintOcrModule extends NativeModule<{}> {}

export default registerWebModule(CableMintOcrModule, 'CableMintOcrModule');
